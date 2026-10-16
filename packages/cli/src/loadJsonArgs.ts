import path from "node:path";
import { DataSourceError } from "@readmint/data";
import { loadJsonData, type JsonFetch } from "@readmint/data-json";
import { workspaceFileReader } from "@readmint/data-json/node";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";

export interface JsonArgsOptions {
  /** Folder file sources are confined to and resolved against. */
  readonly root: string;
  readonly fetch: JsonFetch;
  /** Where header values are read, by the variable names of the specs. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}

/**
 * Loads each JSON source in the order given, as `{ <namespace>: { version: 0, document } }`. A failed load is
 * `CliError` (exit code 4) `JSON data <namespace> (<code>): <message>`, without a cause: the message is the source's
 * redacted text and nothing else of the failure survives.
 */
export async function loadJsonArgs(
  specs: readonly DataJsonSpec[],
  options: JsonArgsOptions,
): Promise<Record<string, unknown>> {
  const readFile = workspaceFileReader(path.resolve(options.root));
  const loaded: [string, unknown][] = [];
  for (const spec of specs) {
    try {
      const result = await loadJsonData({
        source: spec.source,
        namespace: spec.namespace,
        headers: spec.headers,
        env: options.env,
        fetch: options.fetch,
        readFile,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      loaded.push([spec.namespace, result.data]);
    } catch (error) {
      if (isDataSourceError(error)) {
        throw new CliError(
          ExitCode.data,
          `JSON data ${spec.namespace} (${error.code}): ${error.message}`,
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
