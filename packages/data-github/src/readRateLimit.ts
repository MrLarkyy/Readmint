/** Rate-limit state GitHub reports in response headers; a missing or malformed value is `null`. */
export interface RateLimitHeaders {
  readonly remaining: number | null;
  readonly used: number | null;
  /** ISO timestamp of `x-ratelimit-reset`. */
  readonly resetAt: string | null;
  readonly resource: string | null;
  /** `retry-after` in whole seconds; the HTTP-date form is treated as absent. */
  readonly retryAfterSeconds: number | null;
}

const INTEGER = /^\d{1,10}$/;
const RESOURCE = /^[a-z_]{1,32}$/;

export function readRateLimit(headers: Headers): RateLimitHeaders {
  const reset = integerHeader(headers, "x-ratelimit-reset");
  const resource = headers.get("x-ratelimit-resource");
  return {
    remaining: integerHeader(headers, "x-ratelimit-remaining"),
    used: integerHeader(headers, "x-ratelimit-used"),
    resetAt: reset === null ? null : new Date(reset * 1000).toISOString(),
    resource: resource !== null && RESOURCE.test(resource) ? resource : null,
    retryAfterSeconds: integerHeader(headers, "retry-after"),
  };
}

function integerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name)?.trim();
  return value !== undefined && INTEGER.test(value) ? Number(value) : null;
}
