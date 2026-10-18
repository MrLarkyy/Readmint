import { plainText } from "./plainText.js";
import { WAKATIME_DATA_VERSION, type WakaTimeData } from "./WakaTimeData.js";
import { amount, own } from "./answerFields.js";
import { wakaTimeEntries } from "./wakaTimeEntries.js";
import { WakaTimeLimits, type WakaTimeRange } from "./WakaTimeSourceOptions.js";

const LISTS = ["languages", "editors", "operatingSystems"] as const;

/**
 * A cache entry (the JSON of a data object) checked and rebuilt like a fresh answer, or `null` when it is not one of
 * `range`: a corrupt or foreign entry is a miss, never data.
 */
export function readStoredData(stored: string, range: WakaTimeRange): WakaTimeData | null {
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    if (own(value, "version") !== WAKATIME_DATA_VERSION || own(value, "range") !== range) {
      return null;
    }
    const human = own(value, "humanReadableTotal");
    if (typeof human !== "string") return null;
    for (const key of LISTS) if (!Array.isArray(own(value, key))) return null;
    const whole = (key: string): number => Math.round(amount(own(value, key), key));
    return Object.freeze({
      version: WAKATIME_DATA_VERSION,
      range,
      totalSeconds: whole("totalSeconds"),
      humanReadableTotal: plainText(human, WakaTimeLimits.humanTextLength),
      dailyAverageSeconds: whole("dailyAverageSeconds"),
      languages: wakaTimeEntries(own(value, "languages"), "languages", "seconds"),
      editors: wakaTimeEntries(own(value, "editors"), "editors", "seconds"),
      operatingSystems: wakaTimeEntries(
        own(value, "operatingSystems"),
        "operatingSystems",
        "seconds",
      ),
    });
  } catch {
    return null;
  }
}
