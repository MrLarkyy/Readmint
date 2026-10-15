/** One commit of the user to a public repository in the last 7 days. */
export interface GitHubPush {
  /** Repository name without the owner. */
  readonly repository: string;
  /** The first 7 characters of the commit id. */
  readonly hash: string;
  /** First line of the commit message. */
  readonly message: string;
  readonly additions: number;
  readonly deletions: number;
  /** ISO 8601 UTC timestamp of the commit. */
  readonly date: string;
}
