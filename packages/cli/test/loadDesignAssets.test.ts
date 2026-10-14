import { join } from "node:path";
import type { Design } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { afterEach, beforeEach, expect, test } from "vitest";
import { CliError, type DesignFile, ExitCode, loadDesignAssets } from "../src/index.js";
import { type CliTree, makeCliTree, png } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
});

afterEach(async () => {
  await tree.remove();
});

const licence = { embedding: "allowed" } as const;

function designFile(assets: Design["assets"]): DesignFile {
  return {
    design: {
      version: 0,
      canvas: { width: 1, height: 1 },
      layers: [],
      ...(assets === undefined ? {} : { assets }),
    },
    designDir: join(tree.root, "d"),
    path: join(tree.root, "d", "design.json"),
    name: "d/design.json",
  };
}

async function failure(file: DesignFile): Promise<CliError> {
  const error: unknown = await loadDesignAssets(file).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(CliError);
  return error as CliError;
}

test("reads path sources, skips data URIs, ids in sorted order", async () => {
  await tree.file("d/b.png", png);
  await tree.file("d/img/a.png", png);
  await tree.file("d/f.ttf", "font bytes");
  const assets = await loadDesignAssets(
    designFile({
      images: {
        zeta: { src: "b.png" },
        alpha: { src: "img/a.png" },
        inline: { src: "data:image/png;base64,AQID" },
      },
      fonts: { main: { family: "F", src: "f.ttf", licence } },
    }),
  );
  expect(Object.keys(assets.images ?? {})).toEqual(["alpha", "zeta"]);
  expect(assets.images?.["alpha"]).toEqual(new Uint8Array(png));
  expect(new TextDecoder().decode(assets.fonts?.["main"])).toBe("font bytes");
});

test("a design without assets loads none", async () => {
  expect(await loadDesignAssets(designFile(undefined))).toEqual({ fonts: {}, images: {} });
});

test("a font over the renderer's font limit is refused without an absolute path", async () => {
  await tree.file("d/big.ttf", new Uint8Array(RenderLimits.maxFontBytes + 1));
  const error = await failure(
    designFile({ fonts: { big: { family: "F", src: "big.ttf", licence } } }),
  );
  expect(error.exitCode).toBe(ExitCode.invalid);
  expect(error.message).toBe(
    `d/design.json: error asset at /assets/fonts/big/src: asset "big.ttf" is larger than ${String(RenderLimits.maxFontBytes)} bytes`,
  );
  expect(error.message).not.toContain(tree.root);
});

test("an image over the renderer's image limit is refused", async () => {
  await tree.file("d/big.png", new Uint8Array(RenderLimits.maxImageBytes + 1));
  const error = await failure(designFile({ images: { "a/b~c": { src: "big.png" } } }));
  expect(error.message).toBe(
    `d/design.json: error asset at /assets/images/a~1b~0c/src: asset "big.png" is larger than ${String(RenderLimits.maxImageBytes)} bytes`,
  );
});

test("a refused asset keeps the AssetPathError as the cause", async () => {
  await tree.file("d/design.json", "{}");
  const error = await failure(designFile({ images: { x: { src: "nope.png" } } }));
  expect(error.cause).toMatchObject({ name: "AssetPathError", code: "not-found", src: "nope.png" });
});

test("a design folder that is gone is an input error without its absolute path", async () => {
  const error = await failure(designFile({ images: { x: { src: "x.png" } } }));
  expect(error.exitCode).toBe(ExitCode.input);
  expect(error.message).toBe("d/design.json: the design folder cannot be opened (ENOENT)");
});
