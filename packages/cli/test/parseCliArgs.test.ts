import { expect, test } from "vitest";
import { parseCliArgs } from "../src/parseCliArgs.js";

test("--locale accepts a region tag the expression tables resolve", () => {
  expect(parseCliArgs(["render", "a.json", "--locale", "cs-CZ"])).toMatchObject({
    locale: "cs-CZ",
  });
});
