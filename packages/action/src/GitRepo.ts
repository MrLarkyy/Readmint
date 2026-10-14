import { ActionError } from "./ActionError.js";
import type { GitResult, GitRunner } from "./GitRunner.js";

/** The identity of the commits the Action makes. */
export const gitIdentity = Object.freeze({
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
});

const commandTimeoutMs = 60_000;
const pushTimeoutMs = 300_000;
const stderrLines = 20;

/**
 * The git work of one run in the workspace repository. The push uses the credentials the
 * checkout left in the repository's config; the data token never reaches git: not in an
 * argument, not in the environment (`gitEnv`). Paths are passed as literal pathspecs, so a file
 * name is never read as a pattern.
 */
export class GitRepo {
  readonly #run: GitRunner;
  readonly #cwd: string;
  readonly #env: Readonly<Record<string, string>>;

  constructor(run: GitRunner, cwd: string, env: Readonly<Record<string, string>>) {
    this.#run = run;
    this.#cwd = cwd;
    this.#env = env;
  }

  /** The checked-out branch, `undefined` on a detached HEAD. */
  async currentBranch(): Promise<string | undefined> {
    const result = await this.#git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (result.code === 1) return undefined;
    return this.#ok(result, "symbolic-ref").stdout.trim();
  }

  /** Throws `ActionError` (git) unless git takes `name` as a branch name. */
  async checkBranchName(name: string): Promise<void> {
    this.#ok(await this.#git(["check-ref-format", "--branch", name]), "check-ref-format");
  }

  /** Stages `paths` and returns those that differ from HEAD, in the order given. */
  async stage(paths: readonly string[]): Promise<string[]> {
    this.#ok(await this.#git(["add", "--", ...literal(paths)]), "add");
    const diff = this.#ok(
      await this.#git([
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--relative",
        "--",
        ...literal(paths),
      ]),
      "diff",
    );
    const changed = new Set(diff.stdout.split("\0").filter((name) => name !== ""));
    return paths.filter((name) => changed.has(name));
  }

  /** Commits only `paths` (anything else staged stays staged, uncommitted); returns the new HEAD. */
  async commit(message: string, paths: readonly string[]): Promise<string> {
    const args = [
      "-c",
      `user.name=${gitIdentity.name}`,
      "-c",
      `user.email=${gitIdentity.email}`,
      "commit",
      "--quiet",
      "--file=-",
      "--",
      ...literal(paths),
    ];
    this.#ok(await this.#git(args, message), "commit");
    return this.#ok(await this.#git(["rev-parse", "HEAD"]), "rev-parse").stdout.trim();
  }

  /** Pushes HEAD to `branch` of `origin`; a rejected push (the branch moved) is an error. */
  async push(branch: string): Promise<void> {
    const result = await this.#git(
      ["push", "--quiet", "origin", `HEAD:refs/heads/${branch}`],
      undefined,
      pushTimeoutMs,
    );
    if (result.code === 0) return;
    throw new ActionError("git", [
      ...failure(result, "push"),
      "the push needs the checkout's credentials (actions/checkout with persist-credentials left on) and permissions: contents: write; a branch that moved since the checkout is rejected, nothing is rebased",
    ]);
  }

  #git(args: readonly string[], input?: string, timeoutMs = commandTimeoutMs): Promise<GitResult> {
    return this.#run(args, {
      cwd: this.#cwd,
      env: this.#env,
      timeoutMs,
      ...(input === undefined ? {} : { input }),
    });
  }

  #ok(result: GitResult, command: string): GitResult {
    if (result.code === 0) return result;
    throw new ActionError("git", failure(result, command));
  }
}

function literal(paths: readonly string[]): string[] {
  return paths.map((name) => `:(literal)${name}`);
}

function failure(result: GitResult, command: string): string[] {
  const status = result.code === null ? "did not finish" : `exited with ${String(result.code)}`;
  const lines = result.stderr
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-stderrLines);
  return [`git ${command} ${status}`, ...lines.map((line) => `git: ${line}`)];
}
