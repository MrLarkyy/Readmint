import { DataSourceError } from "@readmint/data";
import { GITHUB_DATA_NAMESPACE } from "./GitHubData.js";
import { redactSecret } from "./redactSecret.js";

/** Stable machine-readable reason of a failed load; part of the public contract. */
export type GitHubDataErrorCode =
  | "missing-token"
  | "invalid-option"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "secondary-rate-limited"
  | "http"
  | "network"
  | "timeout"
  | "invalid-response"
  | "graphql"
  | "too-large";

export interface GitHubDataErrorDetails {
  readonly status?: number;
  /** ISO timestamp at which the primary rate limit resets. */
  readonly resetAt?: string;
  readonly retryAfterSeconds?: number;
  /** A system error code such as `ECONNRESET`; never the original error object. */
  readonly causeCode?: string;
  /** Redacted from the message and never stored on the error. */
  readonly secret?: string;
}

/**
 * Failure of a GitHub load. It carries no `cause`: a fetch or GitHub error may hold request
 * details, so only a redacted message and plain fields survive.
 */
export class GitHubDataError extends DataSourceError<GitHubDataErrorCode> {
  readonly status?: number;
  readonly resetAt?: string;
  readonly retryAfterSeconds?: number;
  readonly causeCode?: string;

  constructor(code: GitHubDataErrorCode, message: string, details: GitHubDataErrorDetails = {}) {
    super(GITHUB_DATA_NAMESPACE, code, redactSecret(message, details.secret));
    this.name = "GitHubDataError";
    if (details.status !== undefined) this.status = details.status;
    if (details.resetAt !== undefined) this.resetAt = details.resetAt;
    if (details.retryAfterSeconds !== undefined) this.retryAfterSeconds = details.retryAfterSeconds;
    if (details.causeCode !== undefined) this.causeCode = details.causeCode;
  }
}
