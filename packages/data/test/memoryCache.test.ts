import { expect, test } from "vitest";
import { MemoryCache } from "../src/index.js";

test("returns a stored value until its ttl has passed", async () => {
  let now = 1_000;
  const cache = new MemoryCache({ now: () => now });
  await cache.set("k", "v", 60);
  expect(await cache.get("k")).toBe("v");
  now += 59_999;
  expect(await cache.get("k")).toBe("v");
  now += 1;
  expect(await cache.get("k")).toBeUndefined();
});

test("a missing key is a miss", async () => {
  expect(await new MemoryCache().get("k")).toBeUndefined();
});

test("drops its oldest entries past maxEntries", async () => {
  const cache = new MemoryCache({ maxEntries: 2 });
  await cache.set("a", "1", 60);
  await cache.set("b", "2", 60);
  await cache.set("c", "3", 60);
  expect(await cache.get("a")).toBeUndefined();
  expect(await cache.get("b")).toBe("2");
  expect(await cache.get("c")).toBe("3");
});

test("rewriting a key makes it the newest entry", async () => {
  const cache = new MemoryCache({ maxEntries: 2 });
  await cache.set("a", "1", 60);
  await cache.set("b", "2", 60);
  await cache.set("a", "3", 60);
  await cache.set("c", "4", 60);
  expect(await cache.get("b")).toBeUndefined();
  expect(await cache.get("a")).toBe("3");
});
