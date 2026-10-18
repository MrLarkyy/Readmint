import type { DataObject } from "@readmint/data";
import type { WakaTimeRange } from "./WakaTimeSourceOptions.js";

/** Version of the WakaTime data object; it changes only with a breaking change to its shape. */
export const WAKATIME_DATA_VERSION = 0;

/** Namespace the WakaTime source binds under when the host names none. */
export const WAKATIME_DATA_DEFAULT_NAMESPACE = "wakatime";

/** One language, editor or operating system with its coding time. */
export interface WakaTimeEntry {
  /** Plain one-line text, at most 100 code points (a longer one ends in `…`). */
  readonly name: string;
  /** Share of the range's coding time, 0 to 100, two decimals at most. */
  readonly percent: number;
  /** Whole seconds. */
  readonly seconds: number;
}

/** What the WakaTime source binds: the coding time of the range and its biggest languages, editors and systems. */
export interface WakaTimeData extends DataObject {
  readonly version: typeof WAKATIME_DATA_VERSION;
  /** The range asked for. */
  readonly range: WakaTimeRange;
  /** Whole seconds of coding time in the range. */
  readonly totalSeconds: number;
  /** WakaTime's own wording of the total ("12 hrs 30 mins"), at most 64 code points; `""` while calculating. */
  readonly humanReadableTotal: string;
  /** Whole seconds per day on average. */
  readonly dailyAverageSeconds: number;
  /** Most time first, then by name; at most 20 each. */
  readonly languages: readonly WakaTimeEntry[];
  readonly editors: readonly WakaTimeEntry[];
  readonly operatingSystems: readonly WakaTimeEntry[];
}
