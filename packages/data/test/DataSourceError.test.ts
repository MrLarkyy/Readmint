import { inspect } from "node:util";
import { expect, test } from "vitest";
import { DATA_SOURCE_COMMON_ERROR_CODES, DataSourceError } from "../src/index.js";

test("carries the source, the code and a name", () => {
  const error = new DataSourceError("fake", "not-found", "gone");
  expect(error).toBeInstanceOf(Error);
  expect([error.source, error.code, error.name, error.message]).toEqual([
    "fake",
    "not-found",
    "DataSourceError",
    "gone",
  ]);
});

test("redacts the secret and keeps no cause", () => {
  const error = new DataSourceError("fake", "unauthorized", "bad s3cret-value here", {
    secret: "s3cret-value",
  });
  expect(error.message).toBe("bad *** here");
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(inspect(error)).not.toContain("s3cret-value");
});

test("ignores an empty secret", () => {
  expect(new DataSourceError("fake", "network", "abc", { secret: "" }).message).toBe("abc");
});

test("the common codes are frozen", () => {
  expect(Object.isFrozen(DATA_SOURCE_COMMON_ERROR_CODES)).toBe(true);
  expect(DATA_SOURCE_COMMON_ERROR_CODES).toContain("timeout");
});
