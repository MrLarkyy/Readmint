import { appendFile, type FileHandle, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

type HandleMethod = (this: FileHandle, ...args: unknown[]) => Promise<unknown>;
interface HandleMethods {
  stat: HandleMethod;
  read: HandleMethod;
}

async function handlePrototype(path: string): Promise<HandleMethods> {
  const handle = await open(path);
  try {
    return Object.getPrototypeOf(handle) as HandleMethods;
  } finally {
    await handle.close();
  }
}

describe("readResolvedAsset read-loop cap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a file reporting size 0 but holding more than maxBytes is too-large after 11 bytes", async () => {
    const target = await tree.file("design/big.png", new Uint8Array(200_000));
    const asset = await resolveAsset(tree.design, "big.png");
    const prototype = await handlePrototype(target);
    const originalStat = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementation(async function (this: FileHandle) {
      const stats = await originalStat.call(this, { bigint: true });
      const reported = Object.create(stats as object) as object;
      return Object.defineProperty(reported, "size", { value: 0n });
    });
    const requested: number[] = [];
    const originalRead = prototype.read;
    vi.spyOn(prototype, "read").mockImplementation(async function (
      this: FileHandle,
      ...args: unknown[]
    ) {
      requested.push(Number(args[2]));
      return originalRead.apply(this, args);
    });
    await expectRefused(readResolvedAsset(asset, { maxBytes: 10 }), "too-large");
    expect(requested).toEqual([11]);
  });
});

describe("filesystem errors become unreadable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function systemError(code: string, syscall: string, path: string): Error {
    return Object.assign(new Error(`${code}: failure, ${syscall} '${path}'`), {
      code,
      syscall,
      path,
    });
  }

  async function expectUnreadable(read: Promise<unknown>, code: string): Promise<void> {
    const error: unknown = await read.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AssetPathError);
    expect(error).toMatchObject({ code: "unreadable" });
    const { message } = error as AssetPathError;
    expect(message).toContain(code);
    expect(message).not.toContain(tree.root);
    expect(message).not.toMatch(/'|failure/u);
  }

  test.each(["stat", "read"] as const)("EIO on handle.%s", async (method) => {
    const target = await tree.file("design/img.png", bytes);
    const asset = await resolveAsset(tree.design, "img.png");
    const prototype = await handlePrototype(target);
    vi.spyOn(prototype, method).mockRejectedValue(systemError("EIO", method, target));
    await expectUnreadable(readResolvedAsset(asset, { maxBytes: 1024 }), "EIO");
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
