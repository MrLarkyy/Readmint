import { requestApiText, type ApiFailure } from "@readmint/data";
import type { ResolvedWakaTimeOptions } from "./resolveWakaTimeOptions.js";
import { wakaTimeAuthorization } from "./wakaTimeAuthorization.js";
import { WakaTimeLimits, type WakaTimeRange } from "./WakaTimeSourceOptions.js";

/** The only place a request goes: the stats of the key's own user. The range is one of `WAKATIME_RANGES`. */
export function wakaTimeStatsUrl(range: WakaTimeRange): string {
  return `https://wakatime.com/api/v1/users/current/stats/${range}`;
}

export interface WakaTimeAnswer {
  /** 200 or 202 (still calculating). */
  readonly status: 200 | 202;
  /** The UTF-8 body; may be `""` for a 202. */
  readonly text: string;
  /** Requests sent, the retry included. */
  readonly requests: number;
}

const ACCEPTED = new Set([200, 202]);
const TYPED = new Set([200]);

/**
 * GETs the stats of `range` with the key in the `Authorization` header only, through `requestApiText`: no redirect is
 * followed (so the key never reaches another host), one timeout covers every attempt, wait and body, a 429 is waited
 * out once and a 500, 502, 503 or 504 retried once. Errors are fixed text plus a status, never the URL, a header or
 * the upstream body.
 */
export async function requestWakaTime(options: ResolvedWakaTimeOptions): Promise<WakaTimeAnswer> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const answer = await requestApiText(wakaTimeStatsUrl(options.range), {
    namespace: options.namespace,
    label: "WakaTime",
    headers: [
      ["accept", "application/json"],
      ["authorization", wakaTimeAuthorization(options.apiKey)],
      ["user-agent", "readmint"],
    ],
    accepted: ACCEPTED,
    bodied: ACCEPTED,
    typed: TYPED,
    maxBytes: options.maxBytes,
    signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
    fetch: options.fetch,
    sleep: options.sleep,
    secret: options.apiKey,
    maxRetryWaitSeconds: WakaTimeLimits.maxRetryWaitSeconds,
    serverRetryDelayMs: WakaTimeLimits.serverRetryDelayMs,
    statusFailure,
  });
  return {
    status: answer.status === 202 ? 202 : 200,
    text: answer.text,
    requests: answer.requests,
  };
}

function statusFailure(status: number): ApiFailure {
  const at = `(HTTP ${String(status)})`;
  switch (status) {
    case 401:
      return { code: "unauthorized", message: `WakaTime rejected the API key ${at}.` };
    case 402:
    case 403:
      return {
        code: "forbidden",
        message: `WakaTime refused the stats ${at}; the account's plan may not cover this range.`,
      };
    case 404:
      return {
        code: "not-found",
        message: `WakaTime found no stats for this user and range ${at}.`,
      };
    default:
      return {
        code: "invalid-response",
        message: `The WakaTime API answered HTTP ${String(status)}.`,
      };
  }
}
