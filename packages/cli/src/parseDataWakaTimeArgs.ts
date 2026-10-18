import { isDataNamespace } from "@readmint/data";
import {
  WAKATIME_DATA_DEFAULT_NAMESPACE,
  WAKATIME_RANGES,
  type WakaTimeRange,
} from "@readmint/data-wakatime";

/** One WakaTime source of `--data-wakatime` (CLI) or `data-wakatime` (Action), with its `--data-wakatime-range`. */
export interface DataWakaTimeSpec {
  readonly namespace: string;
  /** Name of the environment variable that holds the API key; the key itself is never an argument. */
  readonly variable: string;
  /** Absent: the source's default (`last_7_days`). */
  readonly range?: WakaTimeRange;
}

/** WakaTime sources one command line or Action run may name. */
export const maxDataWakaTimeSources = 4;

const NAMED_SOURCE = /^([a-z][a-z0-9]{0,31})=(.*)$/s;
const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RANGE = /^([a-z][a-z0-9]{0,31})=(.*)$/s;
// A key given where its variable's name belongs: `waka_` keys, and the older bare UUIDs.
const KEY_SHAPED = /^(?:waka_|[0-9a-f]{8}-[0-9a-f]{4}-)/i;

/**
 * Parses `[<namespace>=]<ENV_NAME>` and `<namespace>=<range>` texts into specs in source order, or the problems
 * found. `<namespace>=` is taken only when it is a valid namespace. Problems name namespaces and the fixed range list
 * only, never a value: a key given by mistake in place of its variable's name must not be printed.
 */
export function parseDataWakaTimeArgs(
  sources: readonly string[],
  ranges: readonly string[],
): { readonly specs: readonly DataWakaTimeSpec[]; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (sources.length > maxDataWakaTimeSources) {
    problems.push(`at most ${String(maxDataWakaTimeSources)} WakaTime sources may be given`);
  }
  const byNamespace = new Map<string, { variable: string; range?: WakaTimeRange }>();
  for (const text of sources) {
    const named = NAMED_SOURCE.exec(text);
    const [namespace, variable] =
      named?.[1] !== undefined && named[2] !== undefined && isDataNamespace(named[1])
        ? [named[1], named[2]]
        : [WAKATIME_DATA_DEFAULT_NAMESPACE, text];
    if (byNamespace.has(namespace)) {
      problems.push(`WakaTime namespace ${namespace} is given twice`);
      continue;
    }
    if (KEY_SHAPED.test(variable)) {
      problems.push(
        `the value of WakaTime source ${namespace} looks like an API key (not printed); give the name of the environment variable that holds it`,
      );
    } else if (!VARIABLE.test(variable)) {
      problems.push(
        `WakaTime source ${namespace} must name an environment variable (letters, digits and _, not starting with a digit)`,
      );
    }
    byNamespace.set(namespace, { variable });
  }
  for (const text of ranges) {
    const [, namespace = "", value = ""] = RANGE.exec(text) ?? [];
    if (!isDataNamespace(namespace)) {
      problems.push("a WakaTime range must be <namespace>=<range>");
      continue;
    }
    const spec = byNamespace.get(namespace);
    if (spec === undefined) {
      problems.push(`a WakaTime range names namespace ${namespace}, which has no WakaTime source`);
      continue;
    }
    if (spec.range !== undefined) {
      problems.push(`the range of WakaTime source ${namespace} is given twice`);
      continue;
    }
    const range = WAKATIME_RANGES.find((name) => name === value);
    if (range === undefined) {
      problems.push(
        `the range of WakaTime source ${namespace} must be one of ${WAKATIME_RANGES.join(", ")}`,
      );
      continue;
    }
    spec.range = range;
  }
  const specs = [...byNamespace].map(([namespace, { variable, range }]) => ({
    namespace,
    variable,
    ...(range === undefined ? {} : { range }),
  }));
  return { specs, problems: [...new Set(problems)] };
}
