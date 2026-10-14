import { appendFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  AssetPathError,
  type AssetPathErrorCode,
  readAsset,
  readResolvedAsset,
  resolveAsset,
} from "../src/index.js";
import { type AssetTree, linkDirectory, linkFile, makeAssetTree } from "./assetTree.js";

let tree: AssetTree;

beforeEach(async () => {
  tree = await makeAssetTree();
});

afterEach(async () => {
  await tree.remove();
});

async function expectRefused(read: Promise<unknown>, code: AssetPathErrorCode): Promise<void> {
  const error: unknown = await read.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AssetPathError);
  expect(error).toMatchObject({ code });
}

const bytes = Uint8Array.from({ length: 10 }, (_, index) => index * 25);

describe("readAsset", () => {
  test("returns the file's bytes", async () => {
    await tree.file("design/img.png", bytes);
    await expect(readAsset(tree.design, "img.png", { maxBytes: 1024 })).resolves.toEqual(bytes);
  });

  test("reads a file of exactly maxBytes and refuses one byte more", async () => {
    await tree.file("design/img.png", bytes);
    await expect(readAsset(tree.design, "img.png", { maxBytes: 10 })).resolves.toEqual(bytes);
    await expectRefused(readAsset(tree.design, "img.png", { maxBytes: 9 }), "too-large");
  });

  test("reads a file larger than one read chunk", async () => {
    const large = Uint8Array.from({ length: 200_000 }, (_, index) => index % 251);
    await tree.file("design/big.png", large);
    await expect(readAsset(tree.design, "big.png", { maxBytes: 200_000 })).resolves.toEqual(large);
  });

  test("an empty file is empty bytes", async () => {
    await tree.file("design/empty.png", "");
    await expect(readAsset(tree.design, "empty.png", { maxBytes: 1 })).resolves.toEqual(
      new Uint8Array(0),
    );
  });

  test.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "maxBytes %s is a RangeError",
    async (maxBytes) => {
      await tree.file("design/img.png", bytes);
      await expect(readAsset(tree.design, "img.png", { maxBytes })).rejects.toThrow(RangeError);
      const asset = await resolveAsset(tree.design, "img.png");
      await expect(readResolvedAsset(asset, { maxBytes })).rejects.toThrow(RangeError);
    },
  );

  test("refuses a path leaving the design folder through a junction", async () => {
    await tree.file("outside/secret.png", bytes);
    await linkDirectory(join(tree.root, "outside"), join(tree.design, "link"));
    await expectRefused(readAsset(tree.design, "link/secret.png", { maxBytes: 1024 }), "outside");
  });

  test("refuses a device name before touching the filesystem", async () => {
    await expectRefused(readAsset(tree.design, "a/nul.png", { maxBytes: 1024 }), "device-name");
  });
});

describe("readResolvedAsset after the file changed", () => {
  test("another file renamed over the target is changed", async () => {
    const target = await tree.file("design/img.png", bytes);
    const asset = await resolveAsset(tree.design, "img.png");
    const other = await tree.file("design/other.png", "replacement");
    await rename(other, target);
    await expectRefused(readResolvedAsset(asset, { maxBytes: 1024 }), "changed");
  });

  test("the target replaced by a symlink to an outside file is changed", async (context) => {
    const target = await tree.file("design/img.png", bytes);
    const secret = await tree.file("outside/secret.png", "secret");
    const asset = await resolveAsset(tree.design, "img.png");
    await rm(target);
    await linkFile(context, secret, target);
    await expectRefused(readResolvedAsset(asset, { maxBytes: 1024 }), "changed");
  });

  test("the target removed is changed", async () => {
    const target = await tree.file("design/img.png", bytes);
    const asset = await resolveAsset(tree.design, "img.png");
    await rm(target);
    await expectRefused(readResolvedAsset(asset, { maxBytes: 1024 }), "changed");
  });

  test("the same file grown beyond maxBytes is too-large", async () => {
    const target = await tree.file("design/img.png", bytes);
    const asset = await resolveAsset(tree.design, "img.png");
    await appendFile(target, "more");
    await expectRefused(readResolvedAsset(asset, { maxBytes: 10 }), "too-large");
  });
});

describe("refusal messages", () => {
  test("escape bidi and zero-width characters of the source", async () => {
    const src = "a\u202egnp.\u061c\u200b.png";
    const error: unknown = await readAsset(tree.design, src, { maxBytes: 1024 }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code: "not-found", src });
    const { message } = error as AssetPathError;
    expect(message).toBe(
      'asset "a\\u202egnp.\\u061c\\u200b.png" does not exist in the design folder',
    );
    expect(message).not.toMatch(/[\u202e\u061c\u200b]/u);
  });

  test("the too-large message names the limit", async () => {
    await tree.file("design/img.png", bytes);
    await expect(readAsset(tree.design, "img.png", { maxBytes: 4 })).rejects.toThrow(
      'asset "img.png" is larger than 4 bytes',
    );
  });
});
