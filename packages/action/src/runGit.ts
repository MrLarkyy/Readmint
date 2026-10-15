import { spawn } from "node:child_process";
import { findExecutable, withSearchPath } from "./findExecutable.js";
import type { GitResult, GitRunOptions, GitRunner } from "./GitRunner.js";

/** Most bytes kept of each output stream; git's answers here are short. */
const maxOutputBytes = 1024 * 1024;

/**
 * The real `GitRunner`: spawns `git` without a shell, so no argument is ever parsed by one, and by the absolute path
 * found on `PATH`, never from the workspace, with a `PATH` holding only the entries searched for it (see
 * `findExecutable`), so the programs git starts by name are not found there either. A failure to start, or no git
 * found, resolves with code `null` and the error code as standard error.
 */
export const runGit: GitRunner = async (args, options) => {
  const platform = process.platform;
  const env = withSearchPath(options.env, { platform, cwd: options.cwd });
  const file = await findExecutable("git", { platform, env, cwd: options.cwd });
  if (file === undefined) return { code: null, stdout: "", stderr: "git could not run (ENOENT)" };
  return spawnGit(file, args, { ...options, env });
};

function spawnGit(
  file: string,
  args: readonly string[],
  options: GitRunOptions,
): Promise<GitResult> {
  return new Promise<GitResult>((resolve) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      timeout: options.timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = collect();
    const stderr = collect();
    child.stdout.on("data", stdout.add);
    child.stderr.on("data", stderr.add);
    let settled = false;
    const finish = (result: GitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    // Spawning can fail with or without a later "close"; the first event decides.
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ code: null, stdout: "", stderr: `git could not run (${error.code ?? error.name})` });
    });
    child.on("close", (code) => {
      finish({ code, stdout: stdout.text(), stderr: stderr.text() });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.input ?? "");
  });
}

function collect(): { add: (chunk: Buffer) => void; text: () => string } {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    add: (chunk) => {
      if (size >= maxOutputBytes) return;
      chunks.push(chunk);
      size += chunk.length;
    },
    text: () => Buffer.concat(chunks).subarray(0, maxOutputBytes).toString("utf8"),
  };
}
