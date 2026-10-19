import { DataSourceError } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { loadRegistryData, type RegistryFetch } from "@readmint/data-registry";
import { checkCacheDir } from "./checkCacheDir.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import type { DataRegistrySpec } from "./parseDataRegistryArgs.js";

export interface RegistryArgsOptions {
  readonly fetch: RegistryFetch;
  /** Absolute folder the loads keep their answers in between runs; absent: no cache. */
  readonly cacheDir?: string;
  readonly signal?: AbortSignal;
  /** Called with the namespace and the entries a registry did not know. */
  readonly onMissing?: (namespace: string, missing: readonly string[]) => void;
}

/**
 * Loads each registry source in the order given, as `{ <namespace>: { version: 0, npm, maven } }`. A failed load is
 * `CliError` (exit code 4) `Registry data <namespace> (<code>): <message>`, without a cause: the message is the
 * source's fixed text and nothing else of the failure survives.
 */
export async function loadRegistryArgs(
  specs: readonly DataRegistrySpec[],
  options: RegistryArgsOptions,
): Promise<Record<string, unknown>> {
  if (options.cacheDir !== undefined) await checkCacheDir(options.cacheDir);
  const cache =
    options.cacheDir === undefined ? {} : { cache: new FileCache({ directory: options.cacheDir }) };
  const loaded: [string, unknown][] = [];
  for (const spec of specs) {
    try {
      const result = await loadRegistryData({
        namespace: spec.namespace,
        npm: spec.npm,
        maven: spec.maven,
        fetch: options.fetch,
        ...cache,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (result.meta.missing.length > 0) options.onMissing?.(spec.namespace, result.meta.missing);
      loaded.push([spec.namespace, result.data]);
    } catch (error) {
      if (error instanceof DataSourceError) {
        throw new CliError(
          ExitCode.data,
          `Registry data ${spec.namespace} (${String(error.code)}): ${error.message}`,
        );
      }
      throw error;
    }
  }
  return Object.fromEntries(loaded);
}
