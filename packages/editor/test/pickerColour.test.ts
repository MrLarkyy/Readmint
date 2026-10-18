import { expect, test } from "vitest";
import { pickerValue, withPicked } from "../src/pickerColour.js";

test.each([
  ["#abc", "#aabbcc"],
  ["#abcd", "#aabbcc"],
  ["#aabbcc", "#aabbcc"],
  ["#AABBCC80", "#aabbcc"],
  ["red", "#000000"],
  ["{{ x }}", "#000000"],
])("the picker shows %s as %s", (colour, shown) => {
  expect(pickerValue(colour)).toBe(shown);
});

test.each([
  ["#abc", "#112233", "#112233"],
  ["#abcd", "#112233", "#112233dd"],
  ["#aabbcc", "#112233", "#112233"],
  ["#aabbcc80", "#112233", "#11223380"],
  ["nonsense", "#112233", "#112233"],
])("picking over %s with %s gives %s", (old, picked, result) => {
  expect(withPicked(old, picked)).toBe(result);
});
