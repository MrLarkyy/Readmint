import { compareText } from "./compareText.js";
import type { GitHubCache } from "./GitHubCache.js";
import { GitHubDataError } from "./GitHubDataError.js";
import { GitHubLimits, type GitHubFetch, type GitHubSourceOptions } from "./GitHubSourceOptions.js";
import { isGitHubLogin } from "./isGitHubLogin.js";

export interface ResolvedSourceOptions {
  readonly token: string;
  readonly login: string | null;
  readonly pageSize: number;
  readonly maxRepositories: number;
  /** Lowercased, sorted, without duplicates. */
  readonly excludeRepositories: readonly string[];
  /** 0 = `languagesAuthored` is not loaded. */
  readonly languageCommitCap: number;
  readonly requestTimeoutMs: number;
  readonly maxRetryWaitSeconds: number;
  readonly cacheTtlSeconds: number;
  readonly cache: GitHubCache | null;
  readonly fetch: GitHubFetch;
  /** The public option type takes no signal; a one-argument sleep simply ignores it. */
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly signal: AbortSignal | null;
  readonly languageSignal: AbortSignal | null;
}

// A repository name, optionally `owner/name`.
export const REPOSITORY_PATTERN =
  /^(?:[A-Za-z0-9_](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9_])){0,38}\/)?[A-Za-z0-9._-]{1,100}$/;

// Visible ASCII only: a header value with CR/LF or other bytes could inject headers or make
// fetch throw an error that quotes the value.
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;

/** Checks the caller's options; an error never echoes the token. */
export function resolveSourceOptions(options: GitHubSourceOptions): ResolvedSourceOptions {
  const token: unknown = options.token;
  if (typeof token !== "string" || token.trim() === "") {
    throw new GitHubDataError("missing-token", "A GitHub token is required.");
  }
  if (!TOKEN_PATTERN.test(token)) {
    throw new GitHubDataError(
      "invalid-option",
      "The GitHub token contains characters a token cannot have (whitespace, control or non-ASCII).",
      { secret: token },
    );
  }
  const login: unknown = options.login;
  if (login !== undefined && (typeof login !== "string" || !isGitHubLogin(login))) {
    throw new GitHubDataError("invalid-option", "login is not a valid GitHub login.", {
      secret: token,
    });
  }
  return {
    token,
    login: login ?? null,
    pageSize: integerOption(
      "pageSize",
      options.pageSize,
      GitHubLimits.minPageSize,
      GitHubLimits.maxPageSize,
      GitHubLimits.defaultPageSize,
    ),
    maxRepositories: integerOption(
      "maxRepositories",
      options.maxRepositories,
      GitHubLimits.minRepositories,
      GitHubLimits.maxRepositories,
      GitHubLimits.defaultMaxRepositories,
    ),
    excludeRepositories: excludedRepositories(options.excludeRepositories),
    languageCommitCap: integerOption(
      "languageCommitCap",
      options.languageCommitCap,
      0,
      GitHubLimits.maxLanguageCommitCap,
      GitHubLimits.defaultLanguageCommitCap,
    ),
    requestTimeoutMs: integerOption(
      "requestTimeoutMs",
      options.requestTimeoutMs,
      GitHubLimits.minRequestTimeoutMs,
      GitHubLimits.maxRequestTimeoutMs,
      GitHubLimits.defaultRequestTimeoutMs,
    ),
    maxRetryWaitSeconds: integerOption(
      "maxRetryWaitSeconds",
      options.maxRetryWaitSeconds,
      GitHubLimits.minRetryWaitSeconds,
      GitHubLimits.maxRetryWaitSeconds,
      GitHubLimits.defaultMaxRetryWaitSeconds,
    ),
    cacheTtlSeconds: integerOption(
      "cacheTtlSeconds",
      options.cacheTtlSeconds,
      GitHubLimits.minCacheTtlSeconds,
      GitHubLimits.maxCacheTtlSeconds,
      GitHubLimits.defaultCacheTtlSeconds,
    ),
    cache: options.cache ?? null,
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
    sleep: options.sleep ?? defaultSleep,
    signal: options.signal ?? null,
    languageSignal: options.languageSignal ?? null,
  };
}

// Messages name the entry's position, never its value: the list is the user's private choice.
function excludedRepositories(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GitHubDataError("invalid-option", "excludeRepositories must be a list of names.");
  }
  if (value.length > GitHubLimits.maxExcludedRepositories) {
    throw new GitHubDataError(
      "invalid-option",
      `excludeRepositories takes at most ${String(GitHubLimits.maxExcludedRepositories)} entries.`,
    );
  }
  const names = value.map((entry: unknown, index) => {
    if (typeof entry !== "string" || !REPOSITORY_PATTERN.test(entry)) {
      throw new GitHubDataError(
        "invalid-option",
        `excludeRepositories entry ${String(index + 1)} is not a repository name.`,
      );
    }
    return entry.toLowerCase();
  });
  return [...new Set(names)].sort(compareText);
}

function integerOption(
  name: string,
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new GitHubDataError(
      "invalid-option",
      `${name} must be an integer from ${String(min)} to ${String(max)}.`,
    );
  }
  return value;
}

// Clears its timer on abort: a pending timer would keep a cancelled CLI or Action process alive
// for the rest of the wait (up to 15 minutes).
function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", stop, { once: true });
  });
}
