import { join } from "node:path";
import type { Design } from "@readmint/format";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type DesignFile, loadDesignAssets } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

/** Stats as an SMB share, a FUSE mount or a virtual drive may report them: device and inode 0 for every file. */
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const zeroed = <T extends object>(stats: T): T =>
    Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as T, stats, {
      dev: 0n,
      ino: 0n,
    });
  return {
    ...real,
    stat: async (...args: Parameters<typeof real.stat>) => zeroed(await real.stat(...args)),
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args);
      const own = handle.stat.bind(handle);
      Object.assign(handle, {
        stat: async (...options: Parameters<typeof own>) => zeroed(await own(...options)),
      });
      return handle;
    },
  };
});

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
});

afterEach(async () => {
  await tree.remove();
});

const licence = { embedding: "allowed" } as const;

function designFile(assets: NonNullable<Design["assets"]>): DesignFile {
  return {
    design: { version: 0, canvas: { width: 1, height: 1 }, layers: [], assets },
    designDir: join(tree.root, "d"),
    path: join(tree.root, "d", "design.json"),
    name: "d/design.json",
  };
}

test("on a file system reporting inode 0, different files keep their own bytes; one file still shares", async () => {
  await tree.file("d/a.ttf", "first font");
  await tree.file("d/b.ttf", "second font");
  const assets = await loadDesignAssets(
    designFile({
      fonts: {
        a: { family: "F", src: "a.ttf", licence },
        b: { family: "F", src: "b.ttf", licence },
        c: { family: "F", src: "./a.ttf", licence },
      },
    }),
  );
  const text = (id: string) => new TextDecoder().decode(assets.fonts?.[id]);
  expect([text("a"), text("b"), text("c")]).toEqual(["first font", "second font", "first font"]);
  expect(assets.fonts?.["c"]).toBe(assets.fonts?.["a"]);
});
