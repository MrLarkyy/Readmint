import type { WakaTimeData, WakaTimeEntry } from "@readmint/data-wakatime";

/** A typical week, as `loadWakaTimeData` returns it for the source's own fixture answer (synthetic numbers). */
export function sampleWakaTimeData(): { wakatime: WakaTimeData } {
  return {
    wakatime: {
      version: 0,
      range: "last_7_days",
      totalSeconds: 98766,
      humanReadableTotal: "27 hrs 26 mins",
      dailyAverageSeconds: 14109,
      languages: [
        { name: "TypeScript", percent: 53, seconds: 52346 },
        { name: "Kotlin", percent: 30.59, seconds: 30210 },
        { name: "Markdown", percent: 8.1, seconds: 8000 },
        { name: "JSON", percent: 5.06, seconds: 5000 },
        { name: "YAML", percent: 3.25, seconds: 3210 },
      ],
      editors: [
        { name: "VS Code", percent: 59.5, seconds: 58766 },
        { name: "IntelliJ IDEA", percent: 40.5, seconds: 40000 },
      ],
      operatingSystems: [{ name: "Windows", percent: 100, seconds: 98766 }],
    },
  };
}

/**
 * The longest data the source can return: 20 entries per list with 100-code-point names (the cap, `…` included), a
 * 64-code-point total text, an all-time range and totals of decades.
 */
export function longWakaTimeData(): { wakatime: WakaTimeData } {
  const entries = (prefix: string): WakaTimeEntry[] =>
    Array.from({ length: 20 }, (_, i) => ({
      name: `${prefix} ${String(i + 1)} ${"Wide".repeat(30)}`.slice(0, 99) + "…",
      percent: i === 0 ? 100 : Math.round((20 - i) * 25) / 100,
      seconds: 999_999_999 - i,
    }));
  return {
    wakatime: {
      version: 0,
      range: "all_time",
      totalSeconds: 999_999_999,
      humanReadableTotal: "277777 hrs 46 mins ".repeat(4).slice(0, 63) + "…",
      dailyAverageSeconds: 86_400,
      languages: entries("Language"),
      editors: entries("Editor"),
      operatingSystems: entries("System"),
    },
  };
}

/** What a 202 without stats leaves: the empty data object of a range WakaTime is still calculating. */
export function emptyWakaTimeData(): { wakatime: WakaTimeData } {
  return {
    wakatime: {
      version: 0,
      range: "last_30_days",
      totalSeconds: 0,
      humanReadableTotal: "",
      dailyAverageSeconds: 0,
      languages: [],
      editors: [],
      operatingSystems: [],
    },
  };
}
