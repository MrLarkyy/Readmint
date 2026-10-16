import { expect, test } from "vitest";
import { mediaTypeCheck } from "../src/index.js";

const check = mediaTypeCheck(new Set(["application/json", "text/plain"]), "json", "JSON");

test("accepts a listed type and a suffix type, with no charset or UTF-8", () => {
  expect(check("application/json")).toBeUndefined();
  expect(check("Text/Plain; charset=UTF-8")).toBeUndefined();
  expect(check('application/vnd.x+json; charset="utf8"')).toBeUndefined();
});

test("refuses a missing value, another type and another charset", () => {
  expect(check(null)).toBe("has no content type");
  expect(check("  ")).toBe("has no content type");
  expect(check("text/html")).toBe('has content type "text/html", not JSON');
  expect(check("application/json; charset=latin1")).toBe('has charset "latin1", not UTF-8');
  expect(check("application/x+xml")).toBe('has content type "application/x+xml", not JSON');
});

test("shows a long or unprintable value cut and made printable", () => {
  expect(check('a"é')).toBe('has content type "a??", not JSON');
  expect(check("x".repeat(100))).toBe(`has content type "${"x".repeat(64)}", not JSON`);
});
