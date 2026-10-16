import { afterEach, beforeEach, expect, test } from "vitest";
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
