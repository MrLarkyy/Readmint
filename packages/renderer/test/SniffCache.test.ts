import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { EntropyBudget, maxRenderEntropySteps } from "../src/EntropyBudget.js";
import { SniffCache, sniffCache } from "../src/SniffCache.js";
import { sniffImage, type SniffResult } from "../src/sniffImage.js";
import { costlyProgressiveJpeg, costlyProgressiveSteps } from "./jpegEntropyCases.js";

const assets = join(import.meta.dirname, "assets");
const read = (name: string) => new Uint8Array(readFileSync(join(assets, name)));
const costly = costlyProgressiveJpeg();
const mebibyte = 1024 * 1024;

/** A budget holding `remaining` steps. */
function budgetOf(remaining = maxRenderEntropySteps): EntropyBudget {
  const budget = new EntropyBudget();
  budget.remaining = remaining;
  return budget;
}

/** The result and what is left of a budget of `remaining` after sniffing `data`. */
function sniffWith(data: Uint8Array, remaining?: number) {
  const budget = remaining === undefined ? undefined : budgetOf(remaining);
  const result = sniffImage(data, 1000, budget);
  return { result, remaining: budget?.remaining, exhausted: budget?.exhausted };
}

/** The steps the symbol check of `data` takes, from an empty cache. */
function stepsOf(data: Uint8Array): number {
  sniffCache.clear();
  const budget = budgetOf();
  sniffImage(data, 1000, budget);
  sniffCache.clear();
  return maxRenderEntropySteps - budget.remaining;
}

/** A fake check that accepts anything as a 1x1 JPEG and charges `steps`, counting its calls. */
function fakeCheck(steps = 5) {
  const counter = { calls: 0 };
  const accepted: SniffResult = {
    ok: true,
    info: {
      mime: "image/jpeg",
      width: 1,
      height: 1,
      frames: 1,
      exif: false,
      orientation: 1,
      orientationFields: [],
      colourData: [],
    },
  };
  const check = (_data: Uint8Array, budget: EntropyBudget): SniffResult => {
    counter.calls++;
    budget.remaining -= steps;
    return accepted;
  };
  return { counter, check };
}

const filled = (length: number, value: number) => new Uint8Array(length).fill(value);

beforeEach(() => {
  sniffCache.clear();
});

describe("the sniff cache of sniffImage", () => {
  test("a repeated JPEG skips the symbol check and charges the same steps", () => {
    const first = budgetOf();
    const cold = sniffImage(costly, 1000, first);
    expect(sniffCache.stats).toMatchObject({ hits: 0, misses: 1, entries: 1 });
    const second = budgetOf();
    const warm = sniffImage(costly, 1000, second);
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 1, entries: 1 });
    expect(warm).toEqual(cold);
    expect(cold.ok).toBe(true);
    expect(second.remaining).toBe(first.remaining);
    expect(maxRenderEntropySteps - first.remaining).toBe(costlyProgressiveSteps);
  });

  test.each([
    ["one step short of the check", -1],
    ["exactly the check's steps", 0],
    ["more than the check needs", 1000],
  ])("a budget holding %s ends alike with an empty or a full cache", (_name, extra) => {
    const steps = stepsOf(costly);
    const cold = sniffWith(costly, steps + extra);
    sniffCache.clear();
    sniffImage(costly, 1000);
    const warm = sniffWith(costly, steps + extra);
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 1 });
    expect(warm).toEqual(cold);
    expect(cold.exhausted).toBe(extra < 0);
    expect(cold.result.ok).toBe(extra >= 0);
    expect(cold.remaining).toBe(extra < 0 ? 0 : extra);
  });

  test("a hit on an exhausted budget leaves it exhausted and spent", () => {
    sniffImage(costly, 1000);
    const budget = budgetOf(0);
    budget.exhausted = true;
    const warm = sniffImage(costly, 1000, budget);
    sniffCache.clear();
    const coldBudget = budgetOf(0);
    coldBudget.exhausted = true;
    expect(sniffImage(costly, 1000, coldBudget)).toEqual(warm);
    expect(budget).toEqual(coldBudget);
  });

  test("without a budget the result is the same cold and warm", () => {
    const cold = sniffWith(costly);
    const warm = sniffWith(costly);
    expect(warm).toEqual(cold);
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 1 });
  });

  test("a refused JPEG is not kept: it is checked every time", () => {
    const refused = read("jpeg/sof9.jpg");
    const first = sniffWith(refused, maxRenderEntropySteps);
    expect(first.result.ok).toBe(false);
    expect(sniffWith(refused, maxRenderEntropySteps)).toEqual(first);
    expect(sniffCache.stats).toMatchObject({ hits: 0, misses: 2, entries: 0 });
  });

  test("other formats are not cached", () => {
    sniffImage(read("pattern.png"), 1000);
    sniffImage(read("tall.webp"), 1000);
    sniffImage(read("two-frames.gif"), 1000);
    expect(sniffCache.stats).toEqual({ hits: 0, misses: 0, bytes: 0, entries: 0 });
  });

  test("the bytes are copied: changing the caller's array after the sniff changes nothing kept", () => {
    const data = costly.slice();
    const cold = sniffImage(data, 1000);
    data[data.length - 3] = 0x55;
    expect(sniffImage(costly, 1000)).toEqual(cold);
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 1 });
    sniffImage(data, 1000);
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 2 });
  });

  test("a hit hands out a frozen result", () => {
    sniffImage(read("gradient.jpg"), 1000);
    const warm = sniffImage(read("gradient.jpg"), 1000);
    expect(warm.ok && Object.isFrozen(warm.info)).toBe(true);
    expect(warm.ok && Object.isFrozen(warm.info.colourData)).toBe(true);
    expect(warm.ok && Object.isFrozen(warm.info.orientationFields)).toBe(true);
  });
});

describe("SniffCache", () => {
  test("a key match is a hit only for equal bytes; a collision is a miss and replaces the entry", () => {
    const cache = new SniffCache(mebibyte, 4, () => "same");
    const { counter, check } = fakeCheck();
    cache.sniff(filled(10, 1), undefined, check);
    cache.sniff(filled(10, 2), undefined, check);
    cache.sniff(filled(11, 1), undefined, check);
    expect(counter.calls).toBe(3);
    expect(cache.stats).toEqual({ hits: 0, misses: 3, bytes: 11, entries: 1 });
    cache.sniff(filled(11, 1), undefined, check);
    expect(counter.calls).toBe(3);
    expect(cache.stats.hits).toBe(1);
  });

  test("holds at most maxBytes of images, dropping the least recently used", () => {
    const cache = new SniffCache();
    const { counter, check } = fakeCheck();
    const images = Array.from({ length: 9 }, (_, index) => filled(4 * mebibyte, index));
    for (const image of images.slice(0, 8)) cache.sniff(image, undefined, check);
    expect(cache.stats).toMatchObject({ bytes: 32 * mebibyte, entries: 8 });
    cache.sniff(images[0] ?? filled(0, 0), undefined, check);
    cache.sniff(images[8] ?? filled(0, 0), undefined, check);
    expect(cache.stats).toMatchObject({ hits: 1, misses: 9, bytes: 32 * mebibyte, entries: 8 });
    cache.sniff(images[0] ?? filled(0, 0), undefined, check);
    expect(cache.stats.hits).toBe(2);
    cache.sniff(images[1] ?? filled(0, 0), undefined, check);
    expect(cache.stats.misses).toBe(10);
    expect(counter.calls).toBe(10);
  });

  test("holds at most maxEntries entries", () => {
    const cache = new SniffCache();
    const { check } = fakeCheck();
    const images = Array.from({ length: 65 }, (_, index) => Uint8Array.of(index));
    for (const image of images) cache.sniff(image, undefined, check);
    expect(cache.stats).toMatchObject({ entries: 64, bytes: 64 });
    cache.sniff(images[64] ?? filled(0, 0), undefined, check);
    cache.sniff(images[1] ?? filled(0, 0), undefined, check);
    expect(cache.stats.hits).toBe(2);
    cache.sniff(images[0] ?? filled(0, 0), undefined, check);
    expect(cache.stats).toMatchObject({ hits: 2, misses: 66, entries: 64 });
  });

  test("an image larger than maxBytes is never kept", () => {
    const cache = new SniffCache(16);
    const { check } = fakeCheck();
    cache.sniff(filled(17, 0), undefined, check);
    cache.sniff(filled(17, 0), undefined, check);
    expect(cache.stats).toEqual({ hits: 0, misses: 2, bytes: 0, entries: 0 });
  });

  test("remember keeps an accepted result with its steps, and a refusal not at all", () => {
    const cache = new SniffCache();
    const { counter, check } = fakeCheck(7);
    const { check: other } = fakeCheck(3);
    const accepted = other(filled(1, 0), budgetOf());
    cache.remember(filled(4, 1), { ok: false, message: "no" }, 1);
    expect(cache.stats.entries).toBe(0);
    cache.remember(filled(4, 1), accepted, 3);
    const budget = budgetOf(10);
    expect(cache.sniff(filled(4, 1), budget, check)).toEqual(accepted);
    expect(budget.remaining).toBe(7);
    expect(counter.calls).toBe(0);
  });
});
