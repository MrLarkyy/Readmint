import type { DataObject } from "./DataObject.js";
import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "./DataSource.js";
import type { DataSourceLoadOptions } from "./DataSourceLoadOptions.js";
import { isDataNamespace } from "./isDataNamespace.js";

/** Validates a plugin descriptor, reading own properties only; throws naming the bad member. */
export function checkDataSource(value: unknown): DataSource<DataSourceLoadOptions, DataObject> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("data source: not an object");
  }
  const own = (name: string): unknown =>
    Object.hasOwn(value, name) ? (value as Record<string, unknown>)[name] : undefined;
  if (own("interfaceVersion") !== DATA_SOURCE_INTERFACE_VERSION) {
    throw new TypeError(
      `data source: unsupported interfaceVersion (expected ${String(DATA_SOURCE_INTERFACE_VERSION)})`,
    );
  }
  if (!isDataNamespace(own("namespace"))) {
    throw new TypeError("data source: invalid namespace");
  }
  const dataVersion = own("dataVersion");
  if (typeof dataVersion !== "number" || !Number.isSafeInteger(dataVersion) || dataVersion < 0) {
    throw new TypeError("data source: dataVersion must be a non-negative integer");
  }
  if (typeof own("load") !== "function") {
    throw new TypeError("data source: load must be a function");
  }
  return value as DataSource<DataSourceLoadOptions, DataObject>;
}
