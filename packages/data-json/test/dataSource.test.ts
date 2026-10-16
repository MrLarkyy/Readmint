import { checkDataSource, type DataObject, type DataSourceLoadOptions } from "@readmint/data";
import { describe, expect, expectTypeOf, test } from "vitest";
import { jsonDataSource, type JsonData, type JsonSourceOptions } from "../src/index.js";
import { failure, json, stubFetch } from "./stubFetch.js";

const URL_SOURCE = "https://data.example/stats.json";

describe("jsonDataSource", () => {
  test("is a valid, frozen descriptor with the json namespace", () => {
    expect(checkDataSource(jsonDataSource)).toBe(jsonDataSource);
    expect(Object.isFrozen(jsonDataSource)).toBe(true);
    expect([jsonDataSource.namespace, jsonDataSource.dataVersion]).toEqual(["json", 0]);
  });

  test("errors carry the default namespace, or the one given", async () => {
    const stub = stubFetch(() => new Response("", { status: 404 }));
    const plain = await failure(jsonDataSource.load({ source: URL_SOURCE, fetch: stub.fetch }));
    expect([plain.source, plain.code]).toEqual(["json", "not-found"]);
    const named = await failure(
      jsonDataSource.load({ source: URL_SOURCE, namespace: "stats", fetch: stub.fetch }),
    );
    expect(named.source).toBe("stats");
  });

  test("a custom namespace loads the same data object", async () => {
    const stub = stubFetch(() => json('{"a":1}'));
    const { data } = await jsonDataSource.load({
      source: URL_SOURCE,
      namespace: "stats",
      fetch: stub.fetch,
    });
    expect(data).toEqual({ version: 0, document: { a: 1 } });
  });

  test.each(["", "Stats", "a-b", "1a", "true", "x".repeat(33)])(
    "namespace %j is invalid-option and nothing is fetched",
    async (namespace) => {
      const stub = stubFetch(() => json("{}"));
      const error = await failure(
        jsonDataSource.load({ source: URL_SOURCE, namespace, fetch: stub.fetch }),
      );
      expect(error.code).toBe("invalid-option");
      expect(stub.calls).toHaveLength(0);
    },
  );

  test("fits the shared contract types", () => {
    expectTypeOf<JsonData>().toExtend<DataObject>();
    expectTypeOf<JsonSourceOptions>().toExtend<DataSourceLoadOptions>();
  });
});
