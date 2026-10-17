import { readBodyCapped, type ReadBodyFailure } from "@readmint/data";
import { GitHubDataError } from "./GitHubDataError.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { readRateLimit, type RateLimitHeaders } from "./readRateLimit.js";
import type { ResolvedSourceOptions } from "./resolveSourceOptions.js";

export type GitHubRequestContext = Pick<
  ResolvedSourceOptions,
  "token" | "fetch" | "sleep" | "requestTimeoutMs" | "maxRetryWaitSeconds" | "signal"
>;

/**
 * Counters of one load, filled in by every request. GraphQL and REST have separate rate limits,
 * so each keeps its own request count and last header set.
 */
export interface RequestStats {
  requests: number;
  lastRateLimit: RateLimitHeaders | null;
  restRequests: number;
  lastRestRateLimit: RateLimitHeaders | null;
}

export function newRequestStats(): RequestStats {
  return { requests: 0, lastRateLimit: null, restRequests: 0, lastRestRateLimit: null };
}

export interface GitHubRequest {
  readonly url: string;
  /** `null` for a GET. */
  readonly body: string | null;
  readonly api: "graphql" | "rest";
}

export interface GitHubResponseText {
  readonly text: string;
  readonly rate: RateLimitHeaders;
}

const SERVER_RETRY_STATUSES = new Set([502, 503, 504]);

/**
 * Sends one request to GitHub with the retry, rate-limit and body-size rules shared by GraphQL and
 * REST, and returns the body of a 2xx answer. The token goes only into the `Authorization` header.
 */
export async function requestGitHub(
  request: GitHubRequest,
  context: GitHubRequestContext,
  stats: RequestStats,
): Promise<GitHubResponseText> {
  let secondaryHits = 0;
  let serverRetried = false;
  for (;;) {
    if (context.signal?.aborted) throw timedOut();
    const signal = requestSignal(context);
    if (request.api === "graphql") stats.requests += 1;
    else stats.restRequests += 1;
    let response: Response;
    try {
      response = await context.fetch(request.url, {
        method: request.body === null ? "GET" : "POST",
        headers: headersFor(request, context.token),
        ...(request.body === null ? {} : { body: request.body }),
        signal,
        redirect: "error",
      });
    } catch (error) {
      throw transportFailure(error, signal);
    }
    const rate = readRateLimit(response.headers);
    if (request.api === "graphql") stats.lastRateLimit = rate;
    else stats.lastRestRateLimit = rate;
    const status = response.status;

    if (status >= 200 && status < 300) return { text: await readText(response, signal), rate };
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

function headersFor(request: GitHubRequest, token: string): Record<string, string> {
  const common = {
    authorization: `bearer ${token}`,
    "user-agent": "readmint",
  };
  return request.body === null
    ? {
        ...common,
        accept: "application/vnd.github+json",
        "x-github-api-version": GitHubLimits.restApiVersion,
      }
    : { ...common, "content-type": "application/json", accept: "application/json" };
}

/** A GitHub rate-limit refusal as the error every caller already handles. */
export function primaryLimit(rate: RateLimitHeaders, status: number): GitHubDataError {
  const when = rate.resetAt === null ? "" : `; it resets at ${rate.resetAt}`;
  return new GitHubDataError("rate-limited", `GitHub's API rate limit is exhausted${when}.`, {
    status,
    ...(rate.resetAt === null ? {} : { resetAt: rate.resetAt }),
  });
}

/**
 * A retry wait that ends early when the caller aborts. The wait is raced against the signal, since
 * an injected sleep may ignore it; the default sleep also gets it to clear its timer.
 */
async function pause(context: GitHubRequestContext, milliseconds: number): Promise<void> {
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

function requestSignal(context: GitHubRequestContext): AbortSignal {
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
