import { mkdir, readdir, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ActionError } from "../src/index.js";
import { writeOutputs } from "../src/writeOutputs.js";
import { type ActionTree, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
});

afterEach(async () => {
  await tree.remove();
});

const files = [
  { output: "out/a.svg", svg: "<svg>a</svg>" },
  { output: "out/b.svg", svg: "<svg>b</svg>" },
];

async function outputError(promise: Promise<unknown>): Promise<readonly string[]> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error instanceof ActionError && error.kind === "output") return error.lines;
  throw new Error("expected an output error");
}

/** Creates a symbolic link, or answers false where the system refuses (Windows without the right). */
async function trySymlink(target: string, path: string, type: "file" | "dir"): Promise<boolean> {
  try {
    await symlink(target, path, type === "dir" ? "junction" : "file");
    return true;
  } catch {
    return false;
  }
}

describe("writeOutputs", () => {
  test("creates the folder and writes every file", async () => {
    expect(await writeOutputs(tree.root, "out", files)).toEqual(["out/a.svg", "out/b.svg"]);
    expect(await tree.read("out/a.svg")).toBe("<svg>a</svg>");
    expect((await readdir(join(tree.root, "out"))).sort()).toEqual(["a.svg", "b.svg"]);
  });

  test("leaves a file with the same bytes alone, modification time included", async () => {
    await writeOutputs(tree.root, "out", files);
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(join(tree.root, "out", "a.svg"), old, old);
    const changed = await writeOutputs(tree.root, "out", [
      { output: "out/a.svg", svg: "<svg>a</svg>" },
      { output: "out/b.svg", svg: "<svg>B</svg>" },
    ]);
    expect(changed).toEqual(["out/b.svg"]);
    expect((await stat(join(tree.root, "out", "a.svg"))).mtime.getTime()).toBe(old.getTime());
    expect(await tree.read("out/b.svg")).toBe("<svg>B</svg>");
  });

  test("an existing folder at an output path is refused before any write", async () => {
    await mkdir(join(tree.root, "out", "b.svg"), { recursive: true });
    expect(await outputError(writeOutputs(tree.root, "out", files))).toEqual([
      'output "out/b.svg" exists and is not a regular file',
    ]);
    expect(await readdir(join(tree.root, "out"))).toEqual(["b.svg"]);
  });

  test("a link at an output path is refused, the file it points to untouched", async (context) => {
    const target = join(tree.base, "victim.txt");
    await writeFile(target, "keep");
    await mkdir(join(tree.root, "out"));
    if (!(await trySymlink(target, join(tree.root, "out", "a.svg"), "file"))) {
      context.skip();
      return;
    }
    expect(await outputError(writeOutputs(tree.root, "out", files))).toEqual([
      'output "out/a.svg" exists and is not a regular file',
    ]);
    expect(await stat(target)).toMatchObject({ size: 4 });
  });

  test("an output folder that links outside the workspace is refused", async (context) => {
    const outside = join(tree.base, "outside");
    await mkdir(outside);
    if (!(await trySymlink(outside, join(tree.root, "out"), "dir"))) {
      context.skip();
      return;
    }
    expect(await outputError(writeOutputs(tree.root, "out/deeper", files))).toEqual([
      'output-dir "out/deeper" resolves outside the workspace',
    ]);
    expect(await readdir(outside)).toEqual([]);
  });

  test.each(["..", "../x", join("..", "..", "x")])("output folder %s is refused", async (dir) => {
    expect(await outputError(writeOutputs(tree.root, dir, files))).toEqual([
      `output-dir ${JSON.stringify(dir)} resolves outside the workspace`,
    ]);
  });

  test("an absolute output folder outside the workspace is refused", async () => {
    const outside = join(tree.base, "abs");
    expect(await outputError(writeOutputs(tree.root, outside, files))).toHaveLength(1);
    await expect(stat(outside)).rejects.toThrow();
  });

  test("leaves no temporary file behind", async () => {
    await writeOutputs(tree.root, "out", files);
    await writeOutputs(tree.root, "out", [{ output: "out/a.svg", svg: "<svg>x</svg>" }]);
    expect((await readdir(join(tree.root, "out"))).sort()).toEqual(["a.svg", "b.svg"]);
  });
});
