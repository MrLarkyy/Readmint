import { expect, test } from "vitest";
import { clusterStarts } from "../src/index.js";

test("a base keeps its marks, joiners, variation selectors and other ignorables", () => {
  expect(clusterStarts("ae\u0301b")).toEqual([0, 1, 3]);
  expect(clusterStarts("a\u200db\u200c")).toEqual([0, 2]);
  expect(clusterStarts("\u{1f469}\u200d\u{1f4bb}x")).toEqual([0, 5]);
  expect(clusterStarts("\u2764\ufe0f!")).toEqual([0, 2]);
  expect(clusterStarts("a\u2067b")).toEqual([0, 2]);
});

test("Arabic letters with harakat, Devanagari conjuncts and matras stay together", () => {
  expect(clusterStarts("\u0628\u0650\u0633\u0652")).toEqual([0, 2]);
  expect(clusterStarts("\u0939\u093f\u0928\u094d\u0926\u0940")).toEqual([0, 2]);
  expect(clusterStarts("\u0915\u094d\u0937")).toEqual([0]);
  expect(clusterStarts("\u0915\u0937")).toEqual([0, 1]);
});

test("characters above the BMP, regional indicator pairs and emoji modifiers", () => {
  expect(clusterStarts("a\u{1f536}b")).toEqual([0, 1, 3]);
  expect(clusterStarts("\u{1f1e8}\u{1f1ff}\u{1f1e9}\u{1f1ea}")).toEqual([0, 4]);
  expect(clusterStarts("\u{1f44d}\u{1f3fd}x")).toEqual([0, 4]);
});

test("an empty text has no clusters", () => {
  expect(clusterStarts("")).toEqual([]);
});
