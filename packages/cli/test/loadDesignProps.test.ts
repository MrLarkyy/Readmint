import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CliError, ExitCode, loadDesignProps } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
});

afterEach(async () => {
  await tree.remove();
});

async function failure(file: string): Promise<CliError> {
  const error: unknown = await loadDesignProps(file, tree.root).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(CliError);
  return error as CliError;
}

test("reads the sections of a settings file", async () => {
  await tree.file("s.json", { header: { w: 3 } });
  expect(await loadDesignProps("s.json", tree.root)).toEqual({ header: { w: 3 } });
});

test("a missing file and a directory are input errors naming the file", async () => {
  const missing = await failure("nope.json");
  expect(missing).toMatchObject({ exitCode: ExitCode.input });
  expect(missing.message).toBe('settings file "nope.json" does not exist');
  await tree.file("dir/x.json", {});
  expect(await failure("dir")).toMatchObject({ exitCode: ExitCode.input });
});

test("invalid UTF-8 and invalid JSON are invalid, without the content", async () => {
  await tree.file("bad.json", new Uint8Array([0xff, 0xfe, 0x7b]));
  expect(await failure("bad.json")).toMatchObject({ exitCode: ExitCode.invalid });
  await tree.file("text.json", '{"a": {"b": s3cret-word}}');
  const error = await failure("text.json");
  expect(error.exitCode).toBe(ExitCode.invalid);
  expect(error.message).toContain('settings file "text.json"');
  expect(error.message).not.toContain("s3cret-word");
});

test("a wrongly shaped file reports the pointer, never the value", async () => {
  await tree.file("shape.json", { a: { b: { c: "s3cret-word" } } });
  const error = await failure("shape.json");
  expect(error.exitCode).toBe(ExitCode.invalid);
  expect(error.message).toContain("error type at /a/b");
  expect(error.message).not.toContain("s3cret-word");
});

test("a file over the size bound is refused before decoding", async () => {
  await tree.file("big.json", new Uint8Array(3 * 4_194_304 + 4));
  expect(await failure("big.json")).toMatchObject({ exitCode: ExitCode.input });
});

describe("with confinedTo", () => {
  async function confinedFailure(file: string): Promise<CliError> {
    const error: unknown = await loadDesignProps(file, tree.root, {
      confinedTo: join(tree.root, "ws"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }

  test("a file inside is read", async () => {
    await tree.file("ws/sub/s.json", { header: { w: 3 } });
    const options = { confinedTo: join(tree.root, "ws") };
    expect(await loadDesignProps("sub/s.json", tree.root, options)).toEqual({ header: { w: 3 } });
  });

  test("an absolute path is refused without naming the folder", async () => {
    const outside = await tree.file("out.json", { header: { w: "s3cret-word" } });
    const error = await confinedFailure(outside);
    expect(error.exitCode).toBe(ExitCode.input);
    expect(error.message).toMatch(/^settings file ".*" /);
    expect(error.message).not.toContain("s3cret-word");
    expect(error.message).not.toContain("ws");
  });

  test("a link leading outside is refused", async (context) => {
    const outside = await tree.file("out.json", { header: { w: "s3cret-word" } });
    await tree.file("ws/keep.json", {});
    try {
      await symlink(outside, join(tree.root, "ws", "s.json"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }
    const error = await confinedFailure("s.json");
    expect(error.exitCode).toBe(ExitCode.input);
    expect(error.message).toBe('settings file "s.json" resolves outside the root');
  });
});
