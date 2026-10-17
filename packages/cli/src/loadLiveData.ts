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

/** The reading of own commits ends this long before the whole load, so the rest of the data is kept. */
export const liveDataAuthoredMarginMs = 60_000;

/** The limit for a whole load that reads `languageCommitCap` own commits. */
export function liveDataTimeout(languageCommitCap: number): number {
  return liveDataTimeoutMs + languageCommitCap * liveDataTimeoutPerCommitMs;
}

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
  /** Called with `meta.partial` when a part of the data is missing or incomplete (status, pushes, weekly commits, own commits). */
  readonly onPartial?: (parts: readonly GitHubPartialPart[]) => void;
}

/**
 * The GitHub data of `login` bound as `{ github: data }`, the one load the CLI and the Action share. A
 * `GitHubDataError` becomes `CliError` (exit code 4) carrying only its code and redacted message, never a cause:
 * request details may hold the token. Parts GitHub refused or only partly read are reported to `onPartial`, never thrown; the reading of own commits has its own deadline
 * and ends as a partial `authored` while the rest of the data is kept.
 */
export async function loadLiveData(options: LiveDataOptions): Promise<Record<string, unknown>> {
  const total = liveDataTimeout(options.languageCommitCap ?? 0);
  const timeout = AbortSignal.timeout(total);
  try {
    const result = await loadGitHubData({
      token: options.token,
      ...(options.login === undefined ? {} : { login: options.login }),
      ...(options.excludeRepositories === undefined
        ? {}
        : { excludeRepositories: options.excludeRepositories }),
      ...(options.languageCommitCap === undefined || options.languageCommitCap === 0
        ? {}
        : {
            languageCommitCap: options.languageCommitCap,
            languageSignal: AbortSignal.timeout(total - liveDataAuthoredMarginMs),
          }),
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
