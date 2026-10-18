import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";
import { loadRegistryData } from "./loadRegistryData.js";
import {
  REGISTRY_DATA_DEFAULT_NAMESPACE,
  REGISTRY_DATA_VERSION,
  type RegistryData,
} from "./RegistryData.js";
import type { RegistryLoadMeta, RegistrySourceOptions } from "./RegistrySourceOptions.js";

/**
 * The registry source as a `@readmint/data` plugin. `namespace` is the default; a host binding the packages elsewhere
 * passes `options.namespace`, and the data object is the same either way.
 */
export const registryDataSource: DataSource<RegistrySourceOptions, RegistryData, RegistryLoadMeta> =
  Object.freeze({
    interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
    namespace: REGISTRY_DATA_DEFAULT_NAMESPACE,
    dataVersion: REGISTRY_DATA_VERSION,
    load: loadRegistryData,
  });
