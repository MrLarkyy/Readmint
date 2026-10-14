import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AssetPathError, type AssetPathErrorCode, resolveAsset } from "../src/index.js";
import { type AssetTree, linkDirectory, linkFile, makeAssetTree } from "./assetTree.js";

let tree: AssetTree;

beforeEach(async () => {
  tree = await makeAssetTree();
});

afterEach(async () => {
  await tree.remove();
});

async function refusal(designDir: string, src: string): Promise<AssetPathError> {
  const error: unknown = await resolveAsset(designDir, src).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AssetPathError)) throw new Error(`expected an AssetPathError for ${src}`);
  return error;
}

async function expectRefused(src: string, code: AssetPathErrorCode): Promise<void> {
  const error = await refusal(tree.design, src);
  expect(error.code).toBe(code);
  expect(error.src).toBe(src);
}

describe("resolveAsset inside the design folder", () => {
  test("resolves nested files and names starting with two dots", async () => {
    await tree.file("design/sub/nested.png");
    await tree.file("design/..foo.png");
    await expect(resolveAsset(tree.design, "sub/nested.png")).resolves.toMatchObject({
      src: "sub/nested.png",
      path: await tree.real("design/sub/nested.png"),
    });
    await expect(resolveAsset(tree.design, "./..foo.png")).resolves.toMatchObject({
      path: await tree.real("design/..foo.png"),
    });
  });

  test("resolves when the design folder itself is reached through a junction", async () => {
    await tree.file("design/img.png");
    const linked = join(tree.root, "linked-design");
    await linkDirectory(tree.design, linked);
    await expect(resolveAsset(linked, "img.png")).resolves.toMatchObject({
      path: await tree.real("design/img.png"),
    });
  });

  test("accepts a junction that stays inside", async () => {
    await tree.file("design/inner/real.png");
    await linkDirectory(join(tree.design, "inner"), join(tree.design, "alias"));
    await expect(resolveAsset(tree.design, "alias/real.png")).resolves.toMatchObject({
      path: await tree.real("design/inner/real.png"),
    });
  });

  test("accepts a file symlink that stays inside", async (context) => {
    await tree.file("design/inner/real.png");
    await linkFile(context, join(tree.design, "inner", "real.png"), join(tree.design, "f.png"));
    await expect(resolveAsset(tree.design, "f.png")).resolves.toMatchObject({
      path: await tree.real("design/inner/real.png"),
    });
  });
});

describe("resolveAsset refusals", () => {
  test.each<[string, AssetPathErrorCode]>([
    ["a/.. /b.png", "trailing-dot-or-space"],
    ["a/.../b.png", "trailing-dot-or-space"],
    ["CON.png", "device-name"],
    ["COM\u00b9.png", "device-name"],
    ["../x.png", "parent-segment"],
    ["/etc/passwd.png", "absolute"],
    ["C:/x.png", "absolute"],
    ["ab:stream.png", "invalid-character"],
    ["a:stream.png", "absolute"],
  ])("%j is refused lexically as %s, before the filesystem is asked", async (src, code) => {
    await expectRefused(src, code);
  });

  test("a junction to a folder outside", async () => {
    await tree.file("outside/secret.png");
    await linkDirectory(join(tree.root, "outside"), join(tree.design, "link"));
    await expectRefused("link/secret.png", "outside");
  });

  test("a junction to a sibling folder sharing the design folder's name as a prefix", async () => {
    await tree.file("design2/other.png");
    await linkDirectory(join(tree.root, "design2"), join(tree.design, "sib"));
    await expectRefused("sib/other.png", "outside");
  });

  test("a file symlink to a file outside", async (context) => {
    await tree.file("outside/secret.png");
    await linkFile(context, join(tree.root, "outside", "secret.png"), join(tree.design, "f.png"));
    await expectRefused("f.png", "outside");
  });

  test("a dangling junction", async () => {
    await linkDirectory(join(tree.root, "missing"), join(tree.design, "gone"));
    await expectRefused("gone/x.png", "not-found");
  });

  test("a dangling file symlink", async (context) => {
    await linkFile(context, join(tree.root, "missing.png"), join(tree.design, "gone.png"));
    await expectRefused("gone.png", "not-found");
  });

  test("a directory named like an image", async () => {
    await mkdir(join(tree.design, "x.png"));
    await expectRefused("x.png", "not-a-file");
  });

  test("the design folder itself", async () => {
    await expectRefused(".", "outside");
  });

  test("a missing file, with a message quoting the source and no absolute path", async () => {
    const error = await refusal(tree.design, "fonts/missing.woff2");
    expect(error.code).toBe("not-found");
    expect(error.message).toBe('asset "fonts/missing.woff2" does not exist in the design folder');
    expect(error.message).not.toContain(tree.root);
    expect(error.message).not.toContain(await tree.real("."));
  });

  test("the outside message names no path but the source", async () => {
    await tree.file("outside/secret.png");
    await linkDirectory(join(tree.root, "outside"), join(tree.design, "link"));
    const error = await refusal(tree.design, "link/secret.png");
    expect(error.message).toBe('asset "link/secret.png" resolves outside the design folder');
  });

  test("a missing design folder is the caller's error, not an asset fault", async () => {
    const error: unknown = await resolveAsset(join(tree.root, "nope"), "img.png").catch(
      (reason: unknown) => reason,
    );
    expect(error).not.toBeInstanceOf(AssetPathError);
    expect(error).toMatchObject({ code: "ENOENT" });
  });
});
