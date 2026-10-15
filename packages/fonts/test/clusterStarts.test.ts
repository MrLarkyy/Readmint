import { expect, test } from "vitest";
import { clusterStarts } from "../src/index.js";

test("a base keeps its marks, joiners, variation selectors and other ignorables", () => {
  expect(clusterStarts("aéb")).toEqual([0, 1, 3]);
  expect(clusterStarts("a‍b‌")).toEqual([0]);
  expect(clusterStarts("❤️!")).toEqual([0, 2]);
  expect(clusterStarts("a⁧b")).toEqual([0, 2]);
});

test("Arabic letters with harakat, Devanagari conjuncts and matras stay together", () => {
  expect(clusterStarts("بِسْ")).toEqual([0, 2]);
  expect(clusterStarts("हिन्दी")).toEqual([0, 2]);
  expect(clusterStarts("क्ष")).toEqual([0]);
  expect(clusterStarts("कष")).toEqual([0, 1]);
});

test("characters above the BMP, regional indicator pairs and emoji modifiers", () => {
  expect(clusterStarts("a\u{1f536}b")).toEqual([0, 1, 3]);
  expect(clusterStarts("\u{1f1e8}\u{1f1ff}\u{1f1e9}\u{1f1ea}")).toEqual([0, 4]);
  expect(clusterStarts("\u{1f44d}\u{1f3fd}x")).toEqual([0, 4]);
});

test("an empty text has no clusters", () => {
  expect(clusterStarts("")).toEqual([]);
});
