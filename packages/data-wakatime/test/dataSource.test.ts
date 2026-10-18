import { checkDataSource, type DataObject, type DataSourceLoadOptions } from "@readmint/data";
import { describe, expect, expectTypeOf, test } from "vitest";
import { wakaTimeDataSource, type WakaTimeData, type WakaTimeSourceOptions } from "../src/index.js";
import { CANARY_KEY, failure, fixture, json, stubFetch } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");

describe("wakaTimeDataSource", () => {
  test("is a valid, frozen descriptor with the wakatime namespace", () => {
    expect(checkDataSource(wakaTimeDataSource)).toBe(wakaTimeDataSource);
    expect(Object.isFrozen(wakaTimeDataSource)).toBe(true);
    expect([wakaTimeDataSource.namespace, wakaTimeDataSource.dataVersion]).toEqual(["wakatime", 0]);
  });

  test("errors carry the default namespace, or the one given", async () => {
    const stub = stubFetch(() => json("{}", 401));
    const plain = await failure(wakaTimeDataSource.load({ apiKey: CANARY_KEY, fetch: stub.fetch }));
    expect([plain.source, plain.code]).toEqual(["wakatime", "unauthorized"]);
    const named = await failure(
      wakaTimeDataSource.load({ apiKey: CANARY_KEY, namespace: "coding", fetch: stub.fetch }),
    );
    expect(named.source).toBe("coding");
  });

  test("a custom namespace loads the same data object", async () => {
    const plain = await wakaTimeDataSource.load({
      apiKey: CANARY_KEY,
      fetch: stubFetch(() => json(STATS)).fetch,
    });
    const named = await wakaTimeDataSource.load({
      apiKey: CANARY_KEY,
      namespace: "coding",
      fetch: stubFetch(() => json(STATS)).fetch,
    });
    expect(named.data).toEqual(plain.data);
    expect(plain.data.version).toBe(wakaTimeDataSource.dataVersion);
  });

  test("fits the shared contract types", () => {
    expectTypeOf<WakaTimeData>().toExtend<DataObject>();
    expectTypeOf<WakaTimeSourceOptions>().toExtend<DataSourceLoadOptions>();
  });
});
