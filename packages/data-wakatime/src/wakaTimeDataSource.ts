import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";
import { loadWakaTimeData } from "./loadWakaTimeData.js";
import {
  WAKATIME_DATA_DEFAULT_NAMESPACE,
  WAKATIME_DATA_VERSION,
  type WakaTimeData,
} from "./WakaTimeData.js";
import type { WakaTimeLoadMeta, WakaTimeSourceOptions } from "./WakaTimeSourceOptions.js";

/**
 * The WakaTime source as a `@readmint/data` plugin. `namespace` is the default; a host binding the stats elsewhere
 * passes `options.namespace`, and the data object is the same either way.
 */
export const wakaTimeDataSource: DataSource<WakaTimeSourceOptions, WakaTimeData, WakaTimeLoadMeta> =
  Object.freeze({
    interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
    namespace: WAKATIME_DATA_DEFAULT_NAMESPACE,
    dataVersion: WAKATIME_DATA_VERSION,
    load: loadWakaTimeData,
  });
