import { plainText } from "./plainText.js";
import { WAKATIME_DATA_VERSION, type WakaTimeData } from "./WakaTimeData.js";
import { amount, own } from "./answerFields.js";
import { wakaTimeEntries } from "./wakaTimeEntries.js";
import { WakaTimeShapeError } from "./WakaTimeShapeError.js";
import { WakaTimeLimits, type WakaTimeRange } from "./WakaTimeSourceOptions.js";

export interface ParsedStats {
  readonly data: WakaTimeData;
  /** WakaTime was still calculating: a 202, or `is_up_to_date: false`. */
  readonly partial: boolean;
}

/**
 * The body of a stats answer (`{ data: { total_seconds, human_readable_total, daily_average, languages, editors,
 * operating_systems, is_up_to_date, ... } }`) as the data object. Only those fields are read: projects, machines, the
 * user name and the rest never leave. A 202 is partial; without a `data` object it is the empty object, and its
 * absent numbers are 0. Throws `WakaTimeShapeError` naming the field, never quoting a value.
 */
export function parseStatsResponse(
  text: string,
  status: 200 | 202,
  range: WakaTimeRange,
): ParsedStats {
  const calculating = status === 202;
  if (calculating && text.trim() === "") return { data: emptyData(range), partial: true };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new WakaTimeShapeError("is not valid JSON");
  }
  const stats = isRecord(body) ? own(body, "data") : undefined;
  if (!isRecord(stats)) {
    if (calculating) return { data: emptyData(range), partial: true };
    throw new WakaTimeShapeError("has no data object");
  }
  const number = (key: string): number => {
    const value = own(stats, key);
    if (calculating && (value === undefined || value === null)) return 0;
    return Math.round(amount(value, key));
  };
  const human = own(stats, "human_readable_total");
  if (human !== undefined && human !== null && typeof human !== "string") {
    throw new WakaTimeShapeError("human_readable_total is not text");
  }
  const data: WakaTimeData = Object.freeze({
    version: WAKATIME_DATA_VERSION,
    range,
    totalSeconds: number("total_seconds"),
    humanReadableTotal: plainText(human ?? "", WakaTimeLimits.humanTextLength),
    dailyAverageSeconds: number("daily_average"),
    languages: wakaTimeEntries(own(stats, "languages"), "languages", "total_seconds"),
    editors: wakaTimeEntries(own(stats, "editors"), "editors", "total_seconds"),
    operatingSystems: wakaTimeEntries(
      own(stats, "operating_systems"),
      "operating_systems",
      "total_seconds",
    ),
  });
  return { data, partial: calculating || own(stats, "is_up_to_date") === false };
}

/** The data object while WakaTime has nothing yet. */
function emptyData(range: WakaTimeRange): WakaTimeData {
  return Object.freeze({
    version: WAKATIME_DATA_VERSION,
    range,
    totalSeconds: 0,
    humanReadableTotal: "",
    dailyAverageSeconds: 0,
    languages: Object.freeze([]),
    editors: Object.freeze([]),
    operatingSystems: Object.freeze([]),
  });
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
