import { readBodyCapped, type ReadBodyFailure } from "@readmint/data";
import { GitHubDataError } from "./GitHubDataError.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { isJsonRecord, ownField, type JsonRecord } from "./jsonRecord.js";
import { readRateLimit, type RateLimitHeaders } from "./readRateLimit.js";
import { redactSecret } from "./redactSecret.js";
import type { ResolvedSourceOptions } from "./resolveSourceOptions.js";

export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export interface GraphQLOperation {
  readonly operationName: string;
  readonly query: string;
}

export type GraphQLVariables = Readonly<Record<string, string | number | readonly string[] | null>>;

export type GraphQLContext = Pick<
  ResolvedSourceOptions,
  "token" | "fetch" | "sleep" | "requestTimeoutMs" | "maxRetryWaitSeconds" | "signal"
>;

/** Counters of one load, filled in by every request. */
export interface RequestStats {
  requests: number;
  lastRateLimit: RateLimitHeaders | null;
}

const SERVER_RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_REPORTED_ERRORS = 3;
const MAX_ERROR_MESSAGE = 200;

/**
 * Sends one GraphQL operation and returns its `data` object, unvalidated. The token goes only
 * into the `Authorization` header; the query and variables only into the body.
 */
export async function postGraphQL(
  operation: GraphQLOperation,
  variables: GraphQLVariables,
  context: GraphQLContext,
  stats: RequestStats,
): Promise<JsonRecord> {
  const body = JSON.stringify({
    query: operation.query,
    operationName: operation.operationName,
    variables,
  });
  let secondaryHits = 0;
  let serverRetried = false;
  for (;;) {
    if (context.signal?.aborted) throw timedOut();
    const signal = requestSignal(context);
    stats.requests += 1;
    let response: Response;
    try {
      response = await context.fetch(GITHUB_GRAPHQL_URL, {
        method: "POST",
        headers: {
          authorization: `bearer ${context.token}`,
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "readmint",
        },
        body,
        signal,
        redirect: "error",
      });
    } catch (error) {
      throw transportFailure(error, signal);
    }
    const rate = readRateLimit(response.headers);
    stats.lastRateLimit = rate;
    const status = response.status;

    if (status >= 200 && status < 300) {
      return readGraphQLData(await readText(response, signal), rate, context.token);
    }
    if (status === 401) {
      await discard(response);
      throw new GitHubDataError("unauthorized", "GitHub rejected the token (HTTP 401).", {
        status,
      });
    }
    if (status === 403 || status === 429) {
      if (rate.remaining === 0) {
        await discard(response);
        throw primaryLimit(rate, status);
      }
      const text =
        status === 403 && rate.retryAfterSeconds === null
          ? await readText(response, signal)
          : await discard(response);
      if (status === 429 || rate.retryAfterSeconds !== null || /secondary rate limit/i.test(text)) {
        secondaryHits += 1;
        const wait = rate.retryAfterSeconds ?? GitHubLimits.defaultSecondaryWaitSeconds;
        if (wait > context.maxRetryWaitSeconds || secondaryHits >= GitHubLimits.maxAttempts) {
          throw new GitHubDataError(
            "secondary-rate-limited",
            `GitHub's secondary rate limit was hit; retry after ${String(wait)} seconds.`,
            { status, retryAfterSeconds: wait },
          );
        }
        await pause(context, wait * 1000);
        continue;
      }
      throw new GitHubDataError(
        "forbidden",
        "GitHub refused the request (HTTP 403); the token may lack a required scope.",
        { status },
      );
    }
    await discard(response);
    if (SERVER_RETRY_STATUSES.has(status) && !serverRetried) {
      serverRetried = true;
      await pause(context, GitHubLimits.serverErrorRetryDelayMs);
      continue;
    }
    throw new GitHubDataError("http", `The GitHub API responded with HTTP ${String(status)}.`, {
      status,
    });
  }
}

/**
 * A retry wait that ends early when the caller aborts. The wait is raced against the signal, since
 * an injected sleep may ignore it; the default sleep also gets it to clear its timer.
 */
async function pause(context: GraphQLContext, milliseconds: number): Promise<void> {
  const signal = context.signal;
  if (signal === null) return context.sleep(milliseconds);
  if (signal.aborted) throw timedOut();
  const listeners: (() => void)[] = [];
  const aborted = new Promise<never>((_resolve, reject) => {
    const listener = () => {
      reject(timedOut());
    };
    listeners.push(listener);
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    await Promise.race([context.sleep(milliseconds, signal), aborted]);
  } finally {
    for (const listener of listeners) signal.removeEventListener("abort", listener);
  }
}

function requestSignal(context: GraphQLContext): AbortSignal {
  const timeout = AbortSignal.timeout(context.requestTimeoutMs);
  return context.signal ? AbortSignal.any([timeout, context.signal]) : timeout;
}

async function readText(response: Response, signal: AbortSignal): Promise<string> {
  try {
    return await readBodyCapped(response, GitHubLimits.maxBodyBytes, bodyFailure);
  } catch (error) {
    if (error instanceof GitHubDataError) throw error;
    throw transportFailure(error, signal);
  }
}

function bodyFailure(reason: ReadBodyFailure): GitHubDataError {
  return reason === "too-large"
    ? new GitHubDataError(
        "too-large",
        `The GitHub response is larger than ${String(GitHubLimits.maxBodyBytes)} bytes.`,
      )
    : new GitHubDataError("invalid-response", "The GitHub response is not valid UTF-8.");
}

async function discard(response: Response): Promise<string> {
  await response.body?.cancel().catch(() => undefined);
  return "";
}

function readGraphQLData(text: string, rate: RateLimitHeaders, token: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GitHubDataError("invalid-response", "The GitHub response is not JSON.");
  }
  if (!isJsonRecord(parsed)) {
    throw new GitHubDataError("invalid-response", "The GitHub response is not a JSON object.");
  }
  const errors = ownField(parsed, "errors");
  if (errors !== undefined && errors !== null) {
    if (!Array.isArray(errors)) {
      throw new GitHubDataError("invalid-response", "The GitHub response has malformed errors.");
    }
    if (errors.length > 0) throw graphQLFailure(errors, rate, token);
  }
  const data = ownField(parsed, "data");
  if (!isJsonRecord(data)) {
    throw new GitHubDataError("invalid-response", "The GitHub response has no data.");
  }
  return data;
}

function graphQLFailure(
  errors: readonly unknown[],
  rate: RateLimitHeaders,
  token: string,
): GitHubDataError {
  const types = errors.map(errorType);
  if (types.includes("RATE_LIMITED")) return primaryLimit(rate, 200);
  if (types.every((type) => type === "NOT_FOUND")) {
    return new GitHubDataError("not-found", "GitHub has no user with that login.");
  }
  const reported = errors.slice(0, MAX_REPORTED_ERRORS);
  const summary = reported
    .map((entry, index) => `${types[index] ?? "UNKNOWN"}: ${errorMessage(entry, token)}`)
    .join("; ");
  const more =
    errors.length > reported.length ? ` (+${String(errors.length - reported.length)})` : "";
  return new GitHubDataError("graphql", `GitHub GraphQL error: ${summary}${more}`, {
    secret: token,
  });
}

function errorType(entry: unknown): string {
  const type = isJsonRecord(entry) ? ownField(entry, "type") : undefined;
  return typeof type === "string" && /^[A-Z_]{1,40}$/.test(type) ? type : "UNKNOWN";
}

function errorMessage(entry: unknown, token: string): string {
  const message = isJsonRecord(entry) ? ownField(entry, "message") : undefined;
  if (typeof message !== "string") return "(no message)";
  // Redact before cutting, so a cut cannot leave a token fragment the patterns miss.
  // eslint-disable-next-line no-control-regex
  const clean = redactSecret(message, token).replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.length > MAX_ERROR_MESSAGE ? `${clean.slice(0, MAX_ERROR_MESSAGE)}…` : clean;
}

function primaryLimit(rate: RateLimitHeaders, status: number): GitHubDataError {
  const when = rate.resetAt === null ? "" : `; it resets at ${rate.resetAt}`;
  return new GitHubDataError("rate-limited", `GitHub's API rate limit is exhausted${when}.`, {
    status,
    ...(rate.resetAt === null ? {} : { resetAt: rate.resetAt }),
  });
}

function transportFailure(error: unknown, signal: AbortSignal): GitHubDataError {
  if (signal.aborted || isAbortError(error)) return timedOut();
  const causeCode = systemCode(error);
  return new GitHubDataError("network", "The GitHub API could not be reached.", {
    ...(causeCode === null ? {} : { causeCode }),
  });
}

function timedOut(): GitHubDataError {
  return new GitHubDataError("timeout", "The GitHub request timed out or was aborted.");
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}

function systemCode(error: unknown): string | null {
  for (const candidate of [error, error instanceof Error ? error.cause : undefined]) {
    if (typeof candidate !== "object" || candidate === null || !("code" in candidate)) continue;
    const code = candidate.code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,31}$/.test(code)) return code;
  }
  return null;
}
