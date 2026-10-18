import { requestApiText, type ApiAnswer, type ApiFailure } from "@readmint/data";
import type { ResolvedRegistryOptions } from "./resolveRegistryOptions.js";
import { RegistryLimits } from "./RegistrySourceOptions.js";

/** The service a request goes to, as named in a message ("The npm registry API ..."). */
export type RegistryLabel = "npm registry" | "npm downloads" | "Maven Central";

const FOUND = new Set([200]);
const FOUND_OR_MISSING = new Set([200, 404]);

/**
 * GETs one registry answer through `requestApiText`: no header but `accept` and `user-agent`, no credentials, no
 * redirect. `signal` covers the whole load. A 404 is returned (status 404, empty text) only when `missingIsAnswer`.
 */
export function requestRegistry(
  url: string,
  label: RegistryLabel,
  resolved: ResolvedRegistryOptions,
  signal: AbortSignal,
  missingIsAnswer: boolean,
): Promise<ApiAnswer> {
  return requestApiText(url, {
    namespace: resolved.namespace,
    label,
    headers: [
      ["accept", "application/json"],
      ["user-agent", "readmint"],
    ],
    accepted: missingIsAnswer ? FOUND_OR_MISSING : FOUND,
    bodied: FOUND,
    typed: FOUND,
    maxBytes: resolved.maxBytes,
    signal,
    fetch: resolved.fetch,
    sleep: resolved.sleep,
    maxRetryWaitSeconds: RegistryLimits.maxRetryWaitSeconds,
    serverRetryDelayMs: RegistryLimits.serverRetryDelayMs,
    statusFailure: (status) => statusFailure(label, status),
  });
}

function statusFailure(label: RegistryLabel, status: number): ApiFailure {
  const at = `(HTTP ${String(status)})`;
  switch (status) {
    case 401:
    case 403:
      return { code: "forbidden", message: `The ${label} API refused the request ${at}.` };
    case 404:
      return { code: "not-found", message: `The ${label} API found nothing ${at}.` };
    default:
      return {
        code: "invalid-response",
        message: `The ${label} API answered HTTP ${String(status)}.`,
      };
  }
}
