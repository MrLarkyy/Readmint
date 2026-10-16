import { expect, test } from "vitest";
import { partialDataWarning } from "../src/index.js";
import { CANARY } from "./githubFetch.js";

test("activity alone names the status, the pushes and the pins", () => {
  expect(partialDataWarning(["activity"])).toBe(
    "GitHub data is incomplete (activity): github.status and github.pushes are empty and github.pinned falls back to the top repositories",
  );
});

test("weeks alone names the weekly commits", () => {
  expect(partialDataWarning(["weeks"])).toBe(
    "GitHub data is incomplete (weeks): github.pinned[].weeklyCommits is null",
  );
});

test("both parts are named in the order given, on one line, with no token", () => {
  const line = partialDataWarning(["activity", "weeks"]);
  expect(line).toBe(
    "GitHub data is incomplete (activity, weeks): github.status and github.pushes are empty and github.pinned falls back to the top repositories; github.pinned[].weeklyCommits is null",
  );
  expect(line).not.toContain("\n");
  expect(line).not.toContain(CANARY);
});
