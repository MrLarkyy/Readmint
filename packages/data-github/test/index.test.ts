import { expect, test } from "vitest";
import * as main from "../src/index.js";
import * as node from "../src/node/index.js";

test("exposes its package name", () => {
  expect(main.packageName).toBe("@readmint/data-github");
});

test("exposes the data source API", () => {
  expect(Object.keys(main).sort()).toEqual([
    "GITHUB_DATA_NAMESPACE",
    "GITHUB_DATA_VERSION",
    "GitHubDataError",
    "GitHubLimits",
    "MemoryCache",
    "githubDataSource",
    "loadGitHubData",
    "packageName",
  ]);
  expect(main.GITHUB_DATA_VERSION).toBe(0);
  expect(main.GITHUB_DATA_NAMESPACE).toBe("github");
  expect(Object.isFrozen(main.GitHubLimits)).toBe(true);
});

test("exposes the file cache on the node entry", () => {
  expect(Object.keys(node).sort()).toEqual(["FILE_CACHE_MAX_ENTRY_BYTES", "FileCache"]);
});
