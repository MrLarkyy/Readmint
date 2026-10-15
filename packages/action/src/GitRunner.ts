/** How one git command runs. */
export interface GitRunOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /** Written to standard input, then closed. */
  readonly input?: string;
  readonly timeoutMs: number;
}

/** What one git command returned; `code` is `null` when it did not exit by itself. */
export interface GitResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `git` with these arguments; injectable so tests record every call. */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => Promise<GitResult>;
