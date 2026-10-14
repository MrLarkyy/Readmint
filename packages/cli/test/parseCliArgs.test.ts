import { expect, test } from "vitest";
import { parseCliArgs } from "../src/parseCliArgs.js";

test("--locale refuses a valid tag longer than the lookup accepts", () => {
  expect(() =>
    parseCliArgs(["render", "a.json", "--locale", "cs-CZ-u-nu-latn-ca-gregory-hc-h23-x-foo"]),
  ).toThrow("is not supported");
});

test("--locale refuses a language without a table", () => {
  expect(() => parseCliArgs(["render", "a.json", "--locale", "pl"])).toThrow("is not supported");
});

test("--locale accepts a region tag the expression tables resolve", () => {
  expect(parseCliArgs(["render", "a.json", "--locale", "cs-CZ"])).toMatchObject({
    locale: "cs-CZ",
  });
});
