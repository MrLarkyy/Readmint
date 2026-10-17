import type { GitHubDataErrorCode } from "./GitHubDataError.js";

/**
 * Answers about one query only. A token, rate-limit, network or abort failure would fail the
 * profile request just the same, so those still end the load.
 */
export const OPTIONAL_MISSES: ReadonlySet<GitHubDataErrorCode> = new Set([
  "graphql",
  "forbidden",
  "http",
  "invalid-response",
  "not-found",
  "too-large",
]);
