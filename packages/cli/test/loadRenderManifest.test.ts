import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CliError, ExitCode, loadRenderManifest, renderVariant } from "../src/index.js";
import { type CliTree, makeCliTree, plainDesign } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("ws/designs/a.json", plainDesign);
});

afterEach(async () => {
  await tree.remove();
});

async function failure(file: string): Promise<CliError> {
  const error: unknown = await loadRenderManifest(file, tree.root).catch(
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CliError);
  return error as CliError;
}

test("resolves the designs against the manifest folder", async () => {
  await tree.file("ws/designs/renders.json", {
    renders: [{ name: "a", design: "a.json", props: { slot: 2 } }],
  });
  expect(await loadRenderManifest("ws/designs/renders.json", tree.root)).toEqual({
    label: 'manifest "ws/designs/renders.json"',
    folder: "ws/designs",
    renders: [
      {
        name: "a",
        design: "ws/designs/a.json",
        props: { slot: 2 },
        variants: [],
        at: "/renders/0",
      },
    ],
  });
});

test("a manifest in the working folder has the folder .", async () => {
  await tree.file("renders.json", { renders: [{ name: "a", design: "ws/designs/a.json" }] });
  const loaded = await loadRenderManifest("renders.json", tree.root);
  expect(loaded.folder).toBe(".");
  expect(loaded.renders[0]?.design).toBe("ws/designs/a.json");
});

test("a missing manifest is an input error", async () => {
  const error = await failure("nope.json");
  expect(error.exitCode).toBe(ExitCode.input);
  expect(error.message).toContain('"nope.json"');
});

test("content problems are exit 1 lines with the pointer", async () => {
  await tree.file("m.json", { renders: [{ name: "1", design: "a.json" }] });
  const error = await failure("m.json");
  expect(error.exitCode).toBe(ExitCode.invalid);
  expect(error.lines).toEqual([
    'manifest "m.json": error pattern at /renders/0/name: the name must be an id (a letter, then letters, digits, _ or -; at most 64) and no Windows device name',
  ]);
});

test("invalid UTF-8 is exit 1", async () => {
  await tree.file("m.json", new Uint8Array([0x7b, 0xff, 0x7d]));
  const error = await failure("m.json");
  expect(error.exitCode).toBe(ExitCode.invalid);
  expect(error.message).toBe('manifest "m.json": error parse at /: not valid UTF-8');
});

test("every missing design is listed, exit 3", async () => {
  await tree.file("ws/designs/m.json", {
    renders: [
      { name: "x", design: "x.json" },
      { name: "a", design: "a.json" },
      { name: "y", design: "dir/y.json" },
    ],
  });
  const error = await failure("ws/designs/m.json");
  expect(error.exitCode).toBe(ExitCode.input);
  expect(error.lines).toEqual([
    'manifest "ws/designs/m.json": error unknown-reference at /renders/0/design: design file "x.json" does not exist',
    'manifest "ws/designs/m.json": error unknown-reference at /renders/2/design: design file "dir/y.json" does not exist',
  ]);
});

test("a design that is a folder is not a file", async () => {
  await tree.file("ws/designs/d.json/inner.txt", "x");
  await tree.file("ws/designs/m.json", { renders: [{ name: "x", design: "d.json" }] });
  const error = await failure("ws/designs/m.json");
  expect(error.exitCode).toBe(ExitCode.input);
  expect(error.message).toContain("is not a regular file");
});

test("a link leading out of the manifest folder is refused", async (context) => {
  const outside = await tree.file("secret/out.json", plainDesign);
  await tree.file("ws/designs/m.json", { renders: [{ name: "x", design: "link.json" }] });
  try {
    await symlink(outside, join(tree.root, "ws", "designs", "link.json"), "file");
  } catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      context.skip();
      return;
    }
    throw error;
  }
  const error = await failure("ws/designs/m.json");
  expect(error.exitCode).toBe(ExitCode.input);
  expect(error.message).toBe(
    'manifest "ws/designs/m.json": error unknown-reference at /renders/0/design: design file "link.json" resolves outside the manifest folder',
  );
});

describe("confined to a folder", () => {
  test("reads a manifest inside it", async () => {
    await tree.file("ws/designs/m.json", { renders: [{ name: "a", design: "a.json" }] });
    const loaded = await loadRenderManifest("designs/m.json", join(tree.root, "ws"), {
      confinedTo: join(tree.root, "ws"),
    });
    expect(loaded.renders).toHaveLength(1);
  });

  test("refuses a path that leaves it", async () => {
    await tree.file("m.json", { renders: [{ name: "a", design: "ws/designs/a.json" }] });
    const error: unknown = await loadRenderManifest("../m.json", join(tree.root, "ws"), {
      confinedTo: join(tree.root, "ws"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).exitCode).toBe(ExitCode.input);
  });
});

describe("the run variant", () => {
  const dark = renderVariant("dark");

  test("is the variant of a render that lists none, and [] keeps none", async () => {
    await tree.file("ws/designs/m.json", {
      renders: [
        { name: "open", design: "a.json" },
        { name: "none", design: "a.json", variants: [] },
      ],
    });
    const loaded = await loadRenderManifest("ws/designs/m.json", tree.root, {
      ...(dark === undefined ? {} : { variant: dark }),
    });
    expect(loaded.renders.map((render) => render.variants.length)).toEqual([1, 0]);
  });

  test("clashing with a prop of a render without variants is refused, exit 1", async () => {
    await tree.file("ws/designs/m.json", {
      renders: [{ name: "a", design: "a.json", props: { theme: "light" } }],
    });
    const error: unknown = await loadRenderManifest("ws/designs/m.json", tree.root, {
      ...(dark === undefined ? {} : { variant: dark }),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).exitCode).toBe(ExitCode.invalid);
    expect((error as CliError).lines).toEqual([
      'manifest "ws/designs/m.json": error duplicate-key at /renders/0/props/theme: the prop theme is also set by the dark variant; set it in one place',
    ]);
  });
});
