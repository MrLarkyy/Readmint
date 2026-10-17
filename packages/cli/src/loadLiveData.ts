import {
  GITHUB_DATA_NAMESPACE,
  GitHubDataError,
  type GitHubFetch,
  type GitHubPartialPart,
  loadGitHubData,
} from "@readmint/data-github";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";

/** How long one GitHub load may take in total, retries and rate-limit waits included. */
export const liveDataTimeoutMs = 300_000;

/** Added to the limit for every own commit read for `languagesAuthored` (one REST request each). */
export const liveDataTimeoutPerCommitMs = 600;

export interface LiveDataOptions {
  /** The user's GitHub token; only `loadGitHubData` sees it, in the `Authorization` header. */
  readonly token: string;
  /** GitHub login to load; the token's owner when absent. */
  readonly login?: string;
  /** Repositories left out of every aggregate, as `name` or `owner/name`. */
  readonly excludeRepositories?: readonly string[];
  /** Own commits read for `github.languagesAuthored`, 0 to 2000 (default 0). */
  readonly languageCommitCap?: number;
  /** The global `fetch` when absent. */
  readonly fetch?: GitHubFetch;
  /** Ends the load early, besides the `liveDataTimeoutMs` limit. */
  readonly signal?: AbortSignal;
  /** Called with `meta.partial` when GitHub refused a part of the data (status, pushes, weekly commits). */
  readonly onPartial?: (parts: readonly GitHubPartialPart[]) => void;
}

/**
 * The GitHub data of `login` bound as `{ github: data }`, the one load the CLI and the Action share. A
 * `GitHubDataError` becomes `CliError` (exit code 4) carrying only its code and redacted message, never a cause:
 * request details may hold the token. Parts GitHub refused are reported to `onPartial`, never thrown.
 */
export async function loadLiveData(options: LiveDataOptions): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(
    liveDataTimeoutMs + (options.languageCommitCap ?? 0) * liveDataTimeoutPerCommitMs,
  );
  try {
    const result = await loadGitHubData({
      token: options.token,
      ...(options.login === undefined ? {} : { login: options.login }),
      ...(options.excludeRepositories === undefined
        ? {}
        : { excludeRepositories: options.excludeRepositories }),
      ...(options.languageCommitCap === undefined
        ? {}
        : { languageCommitCap: options.languageCommitCap }),
      signal: options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    if (result.meta.partial.length > 0) options.onPartial?.(result.meta.partial);
    return { [GITHUB_DATA_NAMESPACE]: result.data };
  } catch (error) {
    if (error instanceof GitHubDataError) {
      throw new CliError(ExitCode.data, `GitHub data (${error.code}): ${error.message}`);
    }
    throw error;
  }
}
