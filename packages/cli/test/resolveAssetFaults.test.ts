import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const failing = vi.hoisted(() => ({ name: "", designCalls: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  const fault = (name: string): Error =>
    Object.assign(new Error(`UNKNOWN: unknown error, ${name} '/secret/place'`), {
      code: "UNKNOWN",
      syscall: name,
    });
  return {
    ...original,
    realpath: async (...args: Parameters<typeof original.realpath>) => {
      failing.designCalls += 1;
      // The first call resolves the design folder itself; its errors are the caller's.
      if (failing.name === "realpath" && failing.designCalls > 1) throw fault("realpath");
      return original.realpath(...args);
    },
    stat: async (...args: Parameters<typeof original.stat>) => {
      if (failing.name === "stat") throw fault("stat");
      return (original.stat as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  };
});

const { AssetPathError, resolveAsset } = await import("../src/index.js");
const { makeAssetTree } = await import("./assetTree.js");

let tree: Awaited<ReturnType<typeof makeAssetTree>>;

beforeEach(async () => {
  failing.name = "";
  failing.designCalls = 0;
  tree = await makeAssetTree();
});

afterEach(async () => {
  failing.name = "";
  await tree.remove();
  vi.restoreAllMocks();
});

describe("resolveAsset with an UNKNOWN system error", () => {
  test.each(["realpath", "stat"])("%s becomes unreadable without a path", async (name) => {
    await tree.file("design/img.png", "x");
    failing.name = name;
    const error: unknown = await resolveAsset(tree.design, "img.png").then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AssetPathError);
    expect(error).toMatchObject({ code: "unreadable" });
    const { message } = error as Error;
    expect(message).toContain("UNKNOWN");
    expect(message).not.toContain("secret");
    expect(message).not.toContain(tree.root);
  });
});
