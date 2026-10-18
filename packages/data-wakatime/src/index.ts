export const packageName = "@readmint/data-wakatime";

export type { WakaTimeData, WakaTimeEntry } from "./WakaTimeData.js";
export type {
  WakaTimeFetch,
  WakaTimeLoadMeta,
  WakaTimeRange,
  WakaTimeSourceOptions,
} from "./WakaTimeSourceOptions.js";
export { WAKATIME_DATA_DEFAULT_NAMESPACE, WAKATIME_DATA_VERSION } from "./WakaTimeData.js";
export { WAKATIME_RANGES, WakaTimeLimits } from "./WakaTimeSourceOptions.js";
export { wakaTimeAuthorization, wakaTimeSecretForms } from "./wakaTimeAuthorization.js";
export { wakaTimeDataSource } from "./wakaTimeDataSource.js";
export { loadWakaTimeData } from "./loadWakaTimeData.js";
export { wakaTimeStatsUrl } from "./requestWakaTime.js";
