import { DataSourceError, type DataSourceCommonErrorCode } from "./DataSourceError.js";
import { mediaTypeCheck } from "./mediaTypeCheck.js";
import { readBodyCapped, type ReadBodyFailure } from "./readBodyCapped.js";

export interface ApiFailure {
  readonly code: DataSourceCommonErrorCode;
  readonly message: string;
}

/** The media type a typed answer must have; JSON unless the caller names another. */
export interface ApiContentType {
  /** Exact `type/subtype` values accepted (lowercase). */
  readonly types: ReadonlySet<string>;
  /** Suffix of `application/*+<suffix>` types also accepted. */
  readonly suffix: string;
  /** Named in the message: "has content type ..., not <kind>". */
  readonly kind: string;
}

export interface ApiRequestContext {
  /** Names the namespace of every error. */
  readonly namespace: string;
  /** The service in messages: "The <label> API redirected; ...". */
  readonly label: string;
  readonly headers: readonly (readonly [string, string])[];
  /** Statuses returned to the caller; every other one is retried or fails. */
  readonly accepted: ReadonlySet<number>;
  /** Accepted statuses whose body is read (capped); the others are discarded and give `""`. */
  readonly bodied: ReadonlySet<number>;
  /** Bodied statuses whose content type must match `content`; a bodied status outside it may have an empty body. */
  readonly typed: ReadonlySet<number>;
  /** The expected media type; default JSON (`application/json`, `+json`). */
  readonly content?: ApiContentType;
  readonly maxBytes: number;
  /** Covers every attempt, wait and body; the caller owns the timeout. */
  readonly signal: AbortSignal;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Redacted from every error message. */
  readonly secret?: string;
  /** Longest `Retry-After` of a 429 waited for, once. */
  readonly maxRetryWaitSeconds: number;
  /** Wait before the one retry of a 500, 502, 503 or 504. */
  readonly serverRetryDelayMs: number;
  /** The error of a status that is neither accepted, a 429 nor a retried server error. */
  readonly statusFailure: (status: number) => ApiFailure;
}

export interface ApiAnswer {
  readonly status: number;
  readonly text: string;
  /** Requests sent, the retry included. */
  readonly requests: number;
}

const SERVER_RETRY = new Set([500, 502, 503, 504]);
const JSON_CONTENT: ApiContentType = {
  types: new Set(["application/json"]),
  suffix: "json",
  kind: "JSON",
};

/**
 * GETs `url` without following a redirect (a redirect is an error after one request, so no header reaches another
 * host). A 429 is waited out once when its `Retry-After` is at most `maxRetryWaitSeconds`; a 500, 502, 503 or 504 is
 * retried once. Errors are fixed text plus a status, never the URL, a header or the upstream body.
 */
export async function requestApiText(url: string, ctx: ApiRequestContext): Promise<ApiAnswer> {
  const { signal } = ctx;
  const fail = (code: DataSourceCommonErrorCode, message: string) =>
    sourceError(ctx, code, message);
  const headers = ctx.headers.map(([name, value]): [string, string] => [name, value]);
  // Called unbound: a browser's fetch throws when called as a method of another object.
  const fetch = ctx.fetch;
  let requests = 0;
  let waited = false;
  let retried = false;
  for (;;) {
    if (signal.aborted) throw timedOut(ctx);
    requests += 1;
    let response: Response;
    try {
      response = await untilAborted(
        fetch(url, { method: "GET", redirect: "manual", credentials: "omit", headers, signal }),
        signal,
      );
    } catch (error) {
      throw transportFailure(error, ctx);
    }
    const status = response.status;
    if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
      await discard(response);
      throw fail("invalid-response", `The ${ctx.label} API redirected; no redirect is followed.`);
    }
    if (ctx.accepted.has(status)) {
      if (!ctx.bodied.has(status)) {
        await discard(response);
        return { status, text: "", requests };
      }
      return { status, text: await readJson(response, status, ctx), requests };
    }
    await discard(response);
    if (status === 429) {
      const wait = retryAfterSeconds(response.headers.get("retry-after"));
      if (waited || wait === null || wait > ctx.maxRetryWaitSeconds) {
        throw fail(
          "rate-limited",
          wait === null
            ? `The ${ctx.label} API rate limit was hit (HTTP 429); retry later.`
            : `The ${ctx.label} API rate limit was hit (HTTP 429); retry after ${String(wait)} seconds.`,
        );
      }
      waited = true;
      await pause(ctx, wait * 1000);
      continue;
    }
    if (SERVER_RETRY.has(status) && !retried) {
      retried = true;
      await pause(ctx, ctx.serverRetryDelayMs);
      continue;
    }
    const failure = ctx.statusFailure(status);
    throw fail(failure.code, failure.message);
  }
}

async function readJson(
  response: Response,
  status: number,
  ctx: ApiRequestContext,
): Promise<string> {
  const { signal } = ctx;
  const bodyFailure = (reason: ReadBodyFailure): DataSourceError =>
    reason === "too-large"
      ? sourceError(
          ctx,
          "too-large",
          `The ${ctx.label} answer is larger than ${String(ctx.maxBytes)} bytes.`,
        )
      : sourceError(ctx, "invalid-response", `The ${ctx.label} answer is not valid UTF-8.`);
  const { types, suffix, kind } = ctx.content ?? JSON_CONTENT;
  const problem = mediaTypeCheck(types, suffix, kind)(response.headers.get("content-type"));
  const refused = (why: string) =>
    sourceError(ctx, "invalid-response", `The ${ctx.label} answer ${why}.`);
  if (problem !== undefined && ctx.typed.has(status)) {
    await discard(response);
    throw refused(problem);
  }
  let text: string;
  try {
    text = await untilAborted(readBodyCapped(response, ctx.maxBytes, bodyFailure), signal);
  } catch (error) {
    if (signal.aborted) await discard(response);
    if (error instanceof DataSourceError) throw error;
    throw transportFailure(error, ctx);
  }
  // An untyped bodied status may come without a body (or a typed one); any body it has is held to the media type.
  if (problem !== undefined && text.trim() !== "") throw refused(problem);
  return text;
}

/** `Retry-After` in whole seconds; the HTTP-date form and anything else is `null`. */
function retryAfterSeconds(value: string | null): number | null {
  if (value === null || !/^\s*\d{1,6}\s*$/.test(value)) return null;
  return Number(value.trim());
}

/** A wait raced against the signal, since an injected sleep may ignore it; the default sleep clears its timer. */
async function pause(ctx: ApiRequestContext, milliseconds: number): Promise<void> {
  const { signal } = ctx;
  if (signal.aborted) throw timedOut(ctx);
  let listener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = () => {
      reject(timedOut(ctx));
    };
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    await Promise.race([ctx.sleep(milliseconds, signal), aborted]);
  } finally {
    if (listener !== undefined) signal.removeEventListener("abort", listener);
  }
}

/** Settles with the promise, or rejects once the signal aborts, for a fetch that ignores it. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(new DOMException("aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error("fetch failed"));
      },
    );
  });
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function transportFailure(error: unknown, ctx: ApiRequestContext): DataSourceError {
  if (ctx.signal.aborted || isAbortError(error)) return timedOut(ctx);
  return sourceError(ctx, "network", `The ${ctx.label} API could not be reached.`);
}

function timedOut(ctx: ApiRequestContext): DataSourceError {
  return sourceError(ctx, "timeout", `The ${ctx.label} request timed out or was aborted.`);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}

function sourceError(
  ctx: ApiRequestContext,
  code: DataSourceCommonErrorCode,
  message: string,
): DataSourceError {
  return new DataSourceError(
    ctx.namespace,
    code,
    message,
    ctx.secret === undefined ? {} : { secret: ctx.secret },
  );
}
