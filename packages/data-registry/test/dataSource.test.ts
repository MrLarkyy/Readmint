import { checkDataSource, type DataObject, type DataSourceLoadOptions } from "@readmint/data";
import { describe, expect, expectTypeOf, test } from "vitest";
import { registryDataSource, type RegistryData, type RegistrySourceOptions } from "../src/index.js";
import { failure, json, registryApis, stubFetch } from "./stubFetch.js";

describe("registryDataSource", () => {
  test("is a valid, frozen descriptor with the registry namespace", () => {
    expect(checkDataSource(registryDataSource)).toBe(registryDataSource);
    expect(Object.isFrozen(registryDataSource)).toBe(true);
    expect([registryDataSource.namespace, registryDataSource.dataVersion]).toEqual(["registry", 0]);
  });

  test("errors carry the default namespace, or the one given", async () => {
    const stub = stubFetch(() => json("{}", 500));
    const plain = await failure(
      registryDataSource.load({
        npm: ["react"],
        fetch: stub.fetch,
        sleep: () => Promise.resolve(),
      }),
    );
    expect(plain.source).toBe("registry");
    const named = await failure(
      registryDataSource.load({
        npm: ["react"],
        namespace: "libs",
        fetch: stub.fetch,
        sleep: () => Promise.resolve(),
      }),
    );
    expect(named.source).toBe("libs");
  });

  test("a custom namespace loads the same data object", async () => {
    const plain = await registryDataSource.load({
      npm: ["react"],
      fetch: stubFetch(registryApis).fetch,
    });
    const named = await registryDataSource.load({
      npm: ["react"],
      namespace: "libs",
      fetch: stubFetch(registryApis).fetch,
    });
    expect(named.data).toEqual(plain.data);
    expect(plain.data.version).toBe(registryDataSource.dataVersion);
  });

  test("fits the shared contract types", () => {
    expectTypeOf<RegistryData>().toExtend<DataObject>();
    expectTypeOf<RegistrySourceOptions>().toExtend<DataSourceLoadOptions>();
  });
});
