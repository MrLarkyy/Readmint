import { DataSourceError } from "@readmint/data";
import { loadFeedData, type FeedFetch } from "@readmint/data-feed";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import type { DataFeedSpec } from "./parseDataFeedArgs.js";

export interface FeedArgsOptions {
  readonly fetch: FeedFetch;
  readonly signal?: AbortSignal;
}

/**
 * Loads each feed in the order given, as `{ <namespace>: { version: 0, title, link, entries } }`. A failed load is
 * `CliError` (exit code 4) `Feed data <namespace> (<code>): <message>`, without a cause: the message is the source's
 * fixed text, which never quotes the URL, and nothing else of the failure survives.
 */
export async function loadFeedArgs(
  specs: readonly DataFeedSpec[],
  options: FeedArgsOptions,
): Promise<Record<string, unknown>> {
  const loaded: [string, unknown][] = [];
  for (const spec of specs) {
    try {
      const result = await loadFeedData({
        url: spec.url,
        namespace: spec.namespace,
        fetch: options.fetch,
        ...(spec.limit === undefined ? {} : { limit: spec.limit }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      loaded.push([spec.namespace, result.data]);
    } catch (error) {
      if (isDataSourceError(error)) {
        throw new CliError(
          ExitCode.data,
          `Feed data ${spec.namespace} (${error.code}): ${error.message}`,
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
