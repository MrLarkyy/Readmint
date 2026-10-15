import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findExecutable } from "../src/findExecutable.js";

/** A file system holding exactly `files`; every probed path is recorded. */
function fakeFs(files: readonly string[]): {
  probed: string[];
  isExecutable: (file: string) => Promise<boolean>;
} {
  const probed: string[] = [];
  const present = new Set(files);
  return {
    probed,
    isExecutable: (file) => {
      probed.push(file);
      return Promise.resolve(present.has(file));
    },
  };
}

const gitForWindows = "C:\\Program Files\\Git\\cmd\\git.exe";
const workspace = "D:\\a\\repo\\repo";

describe("win32", () => {
  test("a git.exe in the cwd is never used, the one on PATH is", async () => {
    const fs = fakeFs([`${workspace}\\git.exe`, gitForWindows]);
    const found = await findExecutable("git", {
      platform: "win32",
      env: { Path: "C:\\Program Files\\Git\\cmd" },
      cwd: workspace,
      isExecutable: fs.isExecutable,
    });
    expect(found).toBe(gitForWindows);
    expect(fs.probed).toEqual([gitForWindows]);
  });

  test("relative, empty, root- or drive-relative entries and entries inside the cwd are never searched", async () => {
    const entries = [
      ".",
      "",
      "bin",
      "\\tools",
      "C:tools",
      workspace,
      "d:\\A\\REPO\\repo\\sub",
      "D:/a/repo/repo/",
      '"C:\\Program Files\\Git\\cmd"',
    ];
    const planted = [
      "git.exe",
      `${workspace}\\git.exe`,
      `${workspace}\\bin\\git.exe`,
      "D:\\tools\\git.exe",
      "C:\\tools\\git.exe",
      "d:\\A\\REPO\\repo\\sub\\git.exe",
      "D:\\a\\repo\\repo\\sub\\git.exe",
    ];
    const fs = fakeFs([...planted, gitForWindows]);
    const found = await findExecutable("git", {
      platform: "win32",
      env: { Path: entries.join(";") },
      cwd: workspace,
      isExecutable: fs.isExecutable,
    });
    expect(found).toBe(gitForWindows);
    expect(fs.probed).toEqual([gitForWindows]);
  });

  test("PATH is read case-insensitively, the key Node uses winning", async () => {
    const fs = fakeFs(["C:\\first\\git.exe", "C:\\second\\git.exe"]);
    const options = { platform: "win32", cwd: workspace, isExecutable: fs.isExecutable } as const;
    expect(
      await findExecutable("git", { ...options, env: { Path: "C:\\second", PATH: "C:\\first" } }),
    ).toBe("C:\\first\\git.exe");
    expect(await findExecutable("git", { ...options, env: { path: "C:\\second" } })).toBe(
      "C:\\second\\git.exe",
    );
  });

  test("UNC entries are searched", async () => {
    const fs = fakeFs(["\\\\host\\share\\git\\git.exe"]);
    const found = await findExecutable("git", {
      platform: "win32",
      env: { PATH: "\\\\host\\share\\git" },
      cwd: workspace,
      isExecutable: fs.isExecutable,
    });
    expect(found).toBe("\\\\host\\share\\git\\git.exe");
  });

  test("only git.exe counts", async () => {
    const fs = fakeFs(["C:\\tools\\git", "C:\\tools\\git.cmd", "C:\\tools\\git.com"]);
    const found = await findExecutable("git", {
      platform: "win32",
      env: { PATH: "C:\\tools" },
      cwd: workspace,
      isExecutable: fs.isExecutable,
    });
    expect(found).toBeUndefined();
  });
});

describe.each(["linux", "darwin"] as const)("%s", (platform) => {
  test("the first absolute PATH entry outside the cwd holding git wins, as on a normal PATH", async () => {
    const fs = fakeFs([
      "git",
      "/work/repo/git",
      "/work/repo/bin/git",
      "/usr/local/bin/git",
      "/usr/bin/git",
    ]);
    const found = await findExecutable("git", {
      platform,
      env: { PATH: ":.:bin:/work/repo:/work/repo/bin:/usr/local/bin:/usr/bin" },
      cwd: "/work/repo",
      isExecutable: fs.isExecutable,
    });
    expect(found).toBe("/usr/local/bin/git");
    expect(fs.probed).toEqual(["/usr/local/bin/git"]);
  });

  test("only PATH itself is read", async () => {
    const fs = fakeFs(["/usr/bin/git"]);
    const found = await findExecutable("git", {
      platform,
      env: { Path: "/usr/bin" },
      cwd: "/work/repo",
      isExecutable: fs.isExecutable,
    });
    expect(found).toBeUndefined();
  });
});

describe.each(["win32", "linux"] as const)("nothing found on %s", (platform) => {
  test.each([
    ["no PATH", {}],
    ["an empty PATH", { PATH: "" }],
    ["no git on PATH", { PATH: platform === "win32" ? "C:\\tools" : "/usr/bin" }],
  ])("%s", async (_, env) => {
    const fs = fakeFs([]);
    const found = await findExecutable("git", {
      platform,
      env,
      cwd: platform === "win32" ? workspace : "/work/repo",
      isExecutable: fs.isExecutable,
    });
    expect(found).toBeUndefined();
  });
});

describe("the default file check", () => {
  let base: string | undefined;

  afterEach(async () => {
    if (base !== undefined) await rm(base, { recursive: true, force: true });
    base = undefined;
  });

  test("a directory, or on POSIX a file without the execute bit, is skipped", async () => {
    base = await mkdtemp(path.join(tmpdir(), "readmint-find-"));
    const name = process.platform === "win32" ? "git.exe" : "git";
    const asDirectory = path.join(base, "dir");
    const notExecutable = path.join(base, "plain");
    const real = path.join(base, "real");
    const cwd = path.join(base, "cwd");
    await mkdir(path.join(asDirectory, name), { recursive: true });
    await mkdir(notExecutable);
    await mkdir(real);
    await mkdir(cwd);
    await writeFile(path.join(notExecutable, name), "", { mode: 0o644 });
    await writeFile(path.join(real, name), "");
    await chmod(path.join(real, name), 0o755);
    const dirs =
      process.platform === "win32" ? [asDirectory, real] : [asDirectory, notExecutable, real];
    const found = await findExecutable("git", {
      platform: process.platform,
      env: { PATH: dirs.join(path.delimiter) },
      cwd,
    });
    expect(found).toBe(path.join(real, name));
  });
});
