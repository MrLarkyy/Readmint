import { mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, design, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", design());
  await writeFile(join(tree.base, "outside.json"), '{"stats":{"v":99},"leaked":{"x":1}}');
  await mkdir(join(tree.base, "elsewhere"));
  await writeFile(join(tree.base, "elsewhere", "data.json"), '{"stats":{"v":99}}');
});

afterEach(async () => {
  await tree.remove();
});

function dryRun(dataFile: string) {
  return tree.run(
    { designs: "card.json", "data-file": dataFile, "dry-run": "true" },
    {
      runGit: () => {
        throw new Error("git must not run");
      },
    },
  );
}

async function expectRefused(dataFile: string, reason: RegExp): Promise<void> {
  const run = await dryRun(dataFile);
  expect(run.code).not.toBe(0);
  expect(run.log).toMatch(/::error::/);
  expect(run.log).toMatch(reason);
  expect(run.log).not.toContain("leaked");
  expect(await readdir(tree.root)).toEqual(["card.json"]);
}

async function link(name: string, target: string, context: { skip: () => void }) {
  try {
    await symlink(target, join(tree.root, name), process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    context.skip();
    return false;
  }
}

describe("data-file is confined to the workspace", () => {
  test("a path with .. is refused at input validation", async () => {
    await expectRefused("../outside.json", /data-file.*leaves the workspace/);
  });

  test("an absolute path is refused", async () => {
    await expectRefused(join(tree.base, "outside.json"), /data-file.*not a relative path/);
  });

  test("a drive path is refused", async () => {
    await expectRefused("C:\\outside.json", /data-file.*not a relative path/);
  });

  test("a junction to a folder outside is refused", async (context) => {
    if (!(await link("escape", join(tree.base, "elsewhere"), context))) return;
    const run = await dryRun("escape/data.json");
    expect(run.code).not.toBe(0);
    expect(run.log).toMatch(/::error::fixture data "escape\/data\.json" resolves outside the root/);
    expect(run.log).not.toContain("elsewhere");
    expect(await readdir(tree.root)).not.toContain("readmint");
  });

  test("a link directly to an outside file is refused", async (context) => {
    try {
      await symlink(join(tree.base, "outside.json"), join(tree.root, "data.json"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }
    const run = await dryRun("data.json");
    expect(run.code).not.toBe(0);
    expect(run.log).toMatch(/::error::fixture data "data\.json" resolves outside the root/);
    expect(run.log).not.toContain("leaked");
    expect(await readdir(tree.root)).not.toContain("readmint");
  });

  test("a nested file with backslashes still renders", async () => {
    await tree.file("fixtures/data.json", { stats: { v: 12 } });
    const run = await dryRun("fixtures\\data.json");
    expect(run.code).toBe(0);
    expect(await tree.read("readmint/card.svg")).toMatch(/^<svg/);
  });

  test("a directory and a file over the cap fail clearly", async () => {
    await mkdir(join(tree.root, "dir.json"));
    const directory = await dryRun("dir.json");
    expect(directory.code).not.toBe(0);
    expect(directory.log).toMatch(/not a regular file/);
    await writeFile(join(tree.root, "big.json"), Buffer.alloc(8 * 1024 * 1024 + 1, 32));
    const big = await dryRun("big.json");
    expect(big.code).not.toBe(0);
    expect(big.log).toMatch(/larger than 8388608 bytes/);
  });
});
