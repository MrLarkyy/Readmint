import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runGit } from "../src/runGit.js";

const win32 = process.platform === "win32";
/** Set, Windows skips the current directory for bare names; this test must see the lookup without it. */
const noCwdLookup = "NoDefaultCurrentDirectoryInExePath";

let workspace: string;
let empty: string;
let savedNoCwdLookup: string | undefined;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "readmint-rungit-"));
  empty = await mkdtemp(path.join(tmpdir(), "readmint-rungit-empty-"));
  savedNoCwdLookup = process.env[noCwdLookup];
  Reflect.deleteProperty(process.env, noCwdLookup);
});

afterEach(async () => {
  if (savedNoCwdLookup !== undefined) process.env[noCwdLookup] = savedNoCwdLookup;
  await rm(workspace, { recursive: true, force: true });
  await rm(empty, { recursive: true, force: true });
});

/** `process.env` with PATH (under Windows' usual key) replaced by `searchPath`. */
function envWithPath(searchPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^path$/i.test(key)) env[key] = value;
  }
  env[win32 ? "Path" : "PATH"] = searchPath;
  return env;
}

/** Puts a program named git into the workspace that prints something other than git would. */
async function plantGit(): Promise<void> {
  if (win32) {
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    await copyFile(
      path.join(systemRoot, "System32", "hostname.exe"),
      path.join(workspace, "git.exe"),
    );
    return;
  }
  const file = path.join(workspace, "git");
  await writeFile(file, "#!/bin/sh\necho planted\n");
  await chmod(file, 0o755);
}

describe("runGit", { timeout: 30_000 }, () => {
  test("a git planted in the workspace, on PATH as itself and as '.', never runs", async () => {
    await plantGit();
    // process.env reads case-insensitively on Windows.
    const original = process.env["PATH"] ?? "";
    const env = envWithPath([workspace, ".", original].join(path.delimiter));
    const result = await runGit(["--version"], { cwd: workspace, env, timeoutMs: 30_000 });
    expect(result.stdout).toMatch(/^git version /);
    expect(result.code).toBe(0);
  });

  test("no git on PATH resolves as a git that could not start", async () => {
    const result = await runGit(["--version"], {
      cwd: workspace,
      env: envWithPath(empty),
      timeoutMs: 30_000,
    });
    expect(result).toEqual({ code: null, stdout: "", stderr: "git could not run (ENOENT)" });
  });

  test("a program git starts by name is never found through the workspace", async () => {
    await plantProbe(workspace, "planted");
    await plantProbe(empty, "outside");
    const original = process.env["PATH"] ?? "";
    const env = envWithPath([workspace, ".", "", empty, original].join(path.delimiter));
    const result = await runGit(["-c", "alias.probe=!readmint-probe", "probe"], {
      cwd: workspace,
      env,
      timeoutMs: 30_000,
    });
    expect(result.stdout.trim()).toBe("outside");
    expect(result.code).toBe(0);
  });

  test("git and what it starts get PATH without relative, empty or workspace entries", async () => {
    const original = process.env["PATH"] ?? "";
    const env = envWithPath([workspace, ".", "", original].join(path.delimiter));
    const result = await runGit(["-c", 'alias.path=!echo "$PATH"', "path"], {
      cwd: workspace,
      env,
      timeoutMs: 30_000,
    });
    expect(result.code).toBe(0);
    const seen = result.stdout.trim();
    expect(seen).not.toContain(path.basename(workspace));
    // Git for Windows' shell shows PATH in its own form; the entries are only comparable on POSIX.
    if (!win32)
      expect(seen.split(":").filter((entry) => entry === "" || entry === ".")).toEqual([]);
  });
  test.skipIf(win32)(
    "git starts in the directory it was found in, with the workspace as -C",
    async () => {
      const file = path.join(empty, "git");
      await writeFile(file, '#!/bin/sh\npwd -P\nfor a in "$@"; do echo "$a"; done\n');
      await chmod(file, 0o755);
      const result = await runGit(["rev-parse", "HEAD"], {
        cwd: path.relative(process.cwd(), workspace),
        env: envWithPath(empty),
        timeoutMs: 30_000,
      });
      expect(result.code).toBe(0);
      expect(result.stdout.trim().split("\n")).toEqual([
        await realpath(empty),
        "-C",
        workspace,
        "rev-parse",
        "HEAD",
      ]);
    },
  );

  test("a relative cwd is resolved against the process directory, not the git directory", async () => {
    const env = envWithPath(process.env["PATH"] ?? "");
    const init = await runGit(["init", "--quiet"], { cwd: workspace, env, timeoutMs: 30_000 });
    expect(init.code).toBe(0);
    const result = await runGit(["rev-parse", "--show-toplevel"], {
      cwd: path.relative(process.cwd(), workspace),
      env,
      timeoutMs: 30_000,
    });
    expect(result.code).toBe(0);
    expect(await realpath(result.stdout.trim())).toBe(await realpath(workspace));
  });

  test.runIf(win32)(
    "DLL names Git for Windows ships, planted in the workspace, change no git call",
    { timeout: 60_000 },
    async () => {
      const env = envWithPath(process.env["PATH"] ?? "");
      const run = (args: string[]): ReturnType<typeof runGit> =>
        runGit(args, { cwd: workspace, env, timeoutMs: 30_000 });
      expect((await run(["init", "--quiet"])).code).toBe(0);
      const execPath = (await run(["--exec-path"])).stdout.trim();
      const gitBin = path.resolve(execPath, "..", "..", "bin");
      const dirs = [execPath, gitBin, path.resolve(execPath, "..", "..", "..", "usr", "bin")];
      const names = new Set<string>();
      for (const dir of dirs) {
        for (const name of await readdir(dir).catch(() => [])) {
          if (name.toLowerCase().endsWith(".dll")) names.add(name);
        }
      }
      expect(names.size).toBeGreaterThan(0);
      for (const name of names) await writeFile(path.join(workspace, name), "not a dll");
      const loaderFailures = [3221225775, 3221225595, 3221225781];
      await writeFile(path.join(workspace, "a.txt"), "a\n");
      const calls = [
        await run(["status", "--porcelain"]),
        await run(["add", "--", "a.txt"]),
        await run([
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "commit",
          "--quiet",
          "-m",
          "x",
        ]),
      ];
      for (const call of calls) expect(call.code).toBe(0);
      const remote = await run(["ls-remote", "https://127.0.0.1:9/x.git"]);
      expect(remote.code).toBe(128);
      expect(remote.stderr).toMatch(/unable to access/);
      for (const call of [...calls, remote]) expect(loaderFailures).not.toContain(call.code);

      const lone = await mkdtemp(path.join(tmpdir(), "readmint-rungit-lone-"));
      try {
        const exe = path.join(lone, "git.exe");
        await copyFile(path.join(gitBin, "git.exe"), exe);
        const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
        const sysPath = [path.join(systemRoot, "System32"), systemRoot].join(path.delimiter);
        const loneEnv = { ...env, Path: sysPath };
        const planted = spawnSync(exe, ["--version"], { cwd: workspace, env: loneEnv });
        expect([3221225775, 3221225595]).toContain(planted.status);
        const neutral = spawnSync(exe, ["--version"], { cwd: empty, env: loneEnv });
        expect(neutral.status).toBe(3221225781);
      } finally {
        await rm(lone, { recursive: true, force: true });
      }
    },
  );
});

/** An executable script `readmint-probe` in `dir` that prints `text`. */
async function plantProbe(dir: string, text: string): Promise<void> {
  const file = path.join(dir, "readmint-probe");
  await writeFile(file, `#!/bin/sh\necho ${text}\n`);
  await chmod(file, 0o755);
}
