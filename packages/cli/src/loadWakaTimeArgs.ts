import { DataSourceError } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { loadWakaTimeData, type WakaTimeFetch } from "@readmint/data-wakatime";
import { checkCacheDir } from "./checkCacheDir.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import type { DataWakaTimeSpec } from "./parseDataWakaTimeArgs.js";

type Env = Readonly<Record<string, string | undefined>>;

export interface WakaTimeArgsOptions {
  readonly fetch: WakaTimeFetch;
  /** Where each spec's variable is read; the key is never an argument. */
  readonly env: Env;
  /** Absolute folder the loads keep their answers in between runs; absent: no cache. */
  readonly cacheDir?: string;
  readonly signal?: AbortSignal;
  /** Called with the namespace of a load WakaTime answered while still calculating. */
  readonly onPartial?: (namespace: string) => void;
}

/**
 * Loads each WakaTime source in the order given, as `{ <namespace>: { version: 0, range, totalSeconds, ... } }`, the key
 * read from the environment variable the spec names. An unset or empty variable, or a failed load, is `CliError`
 * (exit code 4) naming the namespace and the variable or `WakaTime data <namespace> (<code>): <message>`, without a
 * cause: the message is the source's fixed text and nothing else of the failure survives.
 */
export async function loadWakaTimeArgs(
  specs: readonly DataWakaTimeSpec[],
  options: WakaTimeArgsOptions,
): Promise<Record<string, unknown>> {
  const keys = specs.map((spec) => {
    const value = Object.hasOwn(options.env, spec.variable)
      ? options.env[spec.variable]
      : undefined;
    if (value === undefined || value.trim() === "") {
      throw new CliError(
        ExitCode.data,
        `WakaTime data ${spec.namespace} needs the API key in environment variable ${spec.variable}, which is not set or empty`,
      );
    }
    return value;
  });
  if (options.cacheDir !== undefined) await checkCacheDir(options.cacheDir);
  const cache =
    options.cacheDir === undefined ? {} : { cache: new FileCache({ directory: options.cacheDir }) };
  const loaded: [string, unknown][] = [];
  for (const [index, spec] of specs.entries()) {
    try {
      const result = await loadWakaTimeData({
        apiKey: keys[index] ?? "",
        namespace: spec.namespace,
        fetch: options.fetch,
        ...cache,
        ...(spec.range === undefined ? {} : { range: spec.range }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (result.meta.partial) options.onPartial?.(spec.namespace);
      loaded.push([spec.namespace, result.data]);
    } catch (error) {
      if (isDataSourceError(error)) {
        throw new CliError(
          ExitCode.data,
          `WakaTime data ${spec.namespace} (${error.code}): ${error.message}`,
        );
      }
      throw error;
    }
  }
  return Object.fromEntries(loaded);
}

function isDataSourceError(value: unknown): value is DataSourceError {
  return value instanceof DataSourceError;
}
