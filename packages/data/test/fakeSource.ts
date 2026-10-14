import {
  DATA_SOURCE_INTERFACE_VERSION,
  DataSourceError,
  dataSourceCacheKey,
  type DataObject,
  type DataSource,
  type DataSourceLoadOptions,
} from "../src/index.js";

export interface FakeData extends DataObject {
  readonly version: 0;
  readonly value: string;
}

export interface FakeOptions extends DataSourceLoadOptions {
  readonly value?: string;
  readonly secret?: string;
}

export const fakeSource: DataSource<FakeOptions, FakeData> = Object.freeze({
  interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
  namespace: "fake",
  dataVersion: 0,
  async load(options: FakeOptions) {
    if (options.signal?.aborted) {
      throw new DataSourceError("fake", "timeout", "aborted");
    }
    if (options.value === undefined) {
      throw new DataSourceError("fake", "missing-token", `no value for ${options.secret ?? ""}`, {
        ...(options.secret === undefined ? {} : { secret: options.secret }),
      });
    }
    const key = await dataSourceCacheKey(fakeSource, { value: options.value });
    const cached = await options.cache?.get(key).catch(() => undefined);
    if (cached !== undefined) {
      return { data: JSON.parse(cached) as FakeData, meta: { requests: 0, fromCache: true } };
    }
    const data: FakeData = { version: 0, value: options.value };
    await options.cache
      ?.set(key, JSON.stringify(data), options.cacheTtlSeconds ?? 60)
      .catch(() => undefined);
    return { data, meta: { requests: 1, fromCache: false } };
  },
});
