import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";
import { JSON_DATA_DEFAULT_NAMESPACE, JSON_DATA_VERSION, type JsonData } from "./JsonData.js";
import type { JsonSourceOptions } from "./JsonSourceOptions.js";
import { loadJsonData } from "./loadJsonData.js";

/**
 * The JSON source as a `@readmint/data` plugin. `namespace` is the default; a host binding a
 * document elsewhere passes `options.namespace`, and the data object is the same either way.
 */
export const jsonDataSource: DataSource<JsonSourceOptions, JsonData> = Object.freeze({
  interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
  namespace: JSON_DATA_DEFAULT_NAMESPACE,
  dataVersion: JSON_DATA_VERSION,
  load: loadJsonData,
});
