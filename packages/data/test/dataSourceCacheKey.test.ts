import { expect, test } from "vitest";
import { dataSourceCacheKey } from "../src/index.js";

const source = { namespace: "fake", dataVersion: 0 };
const input = { a: "alpha", b: 1, c: true, d: null };

test("is a 64-character lowercase hex digest", async () => {
  expect(await dataSourceCacheKey(source, input)).toMatch(/^[0-9a-f]{64}$/);
});

test("is stable across releases and runtimes", async () => {
  expect(await dataSourceCacheKey(source, input)).toBe(
    "255bf7411f2a4054461983535b70497b2d10be8fb7c7b311827249a9b8064630",
  );
});

test("covers the namespace, the data version and every input field", async () => {
  const base = await dataSourceCacheKey(source, input);
  const variants = [
    dataSourceCacheKey({ ...source, namespace: "other" }, input),
    dataSourceCacheKey({ ...source, dataVersion: 1 }, input),
    dataSourceCacheKey(source, { ...input, a: "beta" }),
    dataSourceCacheKey(source, { ...input, b: 2 }),
    dataSourceCacheKey(source, { ...input, c: false }),
    dataSourceCacheKey(source, { ...input, d: "x" }),
  ];
  const keys = new Set([base, ...(await Promise.all(variants))]);
  expect(keys.size).toBe(7);
});

test("never contains an input string", async () => {
  expect(await dataSourceCacheKey(source, { token: "alpha" })).not.toContain("alpha");
});
