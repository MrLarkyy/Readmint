import { chmod, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
