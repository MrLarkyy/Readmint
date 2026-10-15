import {
  GITHUB_DATA_NAMESPACE,
  GitHubDataError,
  type GitHubFetch,
  loadGitHubData,
} from "@readmint/data-github";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";

/** How long one GitHub load may take in total, retries and rate-limit waits included. */
export const liveDataTimeoutMs = 300_000;

export interface LiveDataOptions {
  /** The user's GitHub token; only `loadGitHubData` sees it, in the `Authorization` header. */
  readonly token: string;
  /** GitHub login to load; the token's owner when absent. */
  readonly login?: string;
  /** The global `fetch` when absent. */
  readonly fetch?: GitHubFetch;
  /** Ends the load early, besides the `liveDataTimeoutMs` limit. */
  readonly signal?: AbortSignal;
}

/**
 * The GitHub data of `login` bound as `{ github: data }`, the one load the CLI and the Action share. A
 * `GitHubDataError` becomes `CliError` (exit code 4) carrying only its code and redacted message, never a cause:
 * request details may hold the token.
 */
export async function loadLiveData(options: LiveDataOptions): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(liveDataTimeoutMs);
  try {
    const result = await loadGitHubData({
      token: options.token,
      ...(options.login === undefined ? {} : { login: options.login }),
      signal: options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    return { [GITHUB_DATA_NAMESPACE]: result.data };
  } catch (error) {
    if (error instanceof GitHubDataError) {
      throw new CliError(ExitCode.data, `GitHub data (${error.code}): ${error.message}`);
    }
    throw error;
  }
}
