import { readFileSync } from "node:fs";
import {
  checkDataSource,
  DataSourceError,
  type DataObject,
  type DataSourceCommonErrorCode,
  type DataSourceLoadOptions,
} from "@readmint/data";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  GitHubDataError,
  githubDataSource,
  type GitHubData,
  type GitHubDataErrorCode,
  type GitHubSourceOptions,
} from "../src/index.js";
import { exchange, FIXTURE_LOGIN, replayFetch, successExchanges } from "./replayFetch.js";

const options = (exchanges: ReturnType<typeof successExchanges>): GitHubSourceOptions => ({
  token: "test-token",
  login: FIXTURE_LOGIN,
  pageSize: 2,
  fetch: replayFetch(exchanges).fetch,
});

describe("githubDataSource", () => {
  test("is a valid, frozen descriptor", () => {
    expect(checkDataSource(githubDataSource)).toBe(githubDataSource);
    expect(Object.isFrozen(githubDataSource)).toBe(true);
    expect([githubDataSource.namespace, githubDataSource.dataVersion]).toEqual(["github", 0]);
  });

  test("loads the unchanged github.* v0 object", async () => {
    const { data } = await githubDataSource.load(options(successExchanges()));
    const expected: unknown = JSON.parse(
      readFileSync(new URL("./fixtures/expected-github-data.json", import.meta.url), "utf8"),
    );
    expect(data).toEqual(expected);
  });

  test("fails with a DataSourceError that keeps the GitHub code", async () => {
    const error: unknown = await githubDataSource
      .load(options([exchange("unauthorized")]))
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DataSourceError);
    expect(error).toBeInstanceOf(GitHubDataError);
    expect((error as GitHubDataError).source).toBe("github");
    expect((error as GitHubDataError).code).toBe("unauthorized");
  });

  test("fits the shared contract types", () => {
    expectTypeOf<DataSourceCommonErrorCode>().toExtend<GitHubDataErrorCode>();
    expectTypeOf<GitHubData>().toExtend<DataObject>();
    expectTypeOf<GitHubSourceOptions>().toExtend<DataSourceLoadOptions>();
  });
});
