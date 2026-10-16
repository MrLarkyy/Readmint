import { checkHttpsUrl, isDataNamespace } from "@readmint/data";
import { FEED_DATA_DEFAULT_NAMESPACE, FeedLimits } from "@readmint/data-feed";

/** One feed of `--data-feed` (CLI) or `data-feed` (Action), with its `--data-feed-limit`. */
export interface DataFeedSpec {
  readonly namespace: string;
  /** The https URL, as given. */
  readonly url: string;
  /** Entries kept, 1..50; absent: the source's default (5). */
  readonly limit?: number;
}

/** Feeds one command line or Action run may name. */
export const maxDataFeedSources = 8;

const NAMED_SOURCE = /^([a-z][a-z0-9]{0,31})=(.+)$/s;
const LIMIT = /^([a-z][a-z0-9]{0,31})=([0-9]{1,3})$/;

/**
 * Parses `[<namespace>=]<url>` and `<namespace>=<n>` texts into specs in source order, or the problems found.
 * `<namespace>=` is taken only when it is a valid namespace, so a URL stays one source under `feed`. Each URL is
 * checked (https, no credentials, at most 2048 characters) without a request. Problems name namespaces only, never a
 * URL: its query may hold a key.
 */
export function parseDataFeedArgs(
  sources: readonly string[],
  limits: readonly string[],
): { readonly specs: readonly DataFeedSpec[]; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (sources.length > maxDataFeedSources) {
    problems.push(`at most ${String(maxDataFeedSources)} feeds may be given`);
  }
  const byNamespace = new Map<string, { url: string; limit?: number }>();
  for (const text of sources) {
    const named = NAMED_SOURCE.exec(text);
    const [namespace, url] =
      named?.[1] !== undefined && named[2] !== undefined && isDataNamespace(named[1])
        ? [named[1], named[2]]
        : [FEED_DATA_DEFAULT_NAMESPACE, text];
    if (byNamespace.has(namespace)) {
      problems.push(`feed namespace ${namespace} is given twice`);
      continue;
    }
    const checked = /^https:\/\//i.test(url) ? checkHttpsUrl(url) : "is not an https URL";
    if (typeof checked === "string") problems.push(`the URL of feed ${namespace} ${checked}`);
    byNamespace.set(namespace, { url });
  }
  for (const text of limits) {
    const [, namespace = "", digits = ""] = LIMIT.exec(text) ?? [];
    if (!isDataNamespace(namespace)) {
      problems.push("a feed limit must be <namespace>=<n>");
      continue;
    }
    const spec = byNamespace.get(namespace);
    if (spec === undefined) {
      problems.push(`a feed limit names namespace ${namespace}, which has no feed`);
      continue;
    }
    if (spec.limit !== undefined) {
      problems.push(`the limit of feed ${namespace} is given twice`);
      continue;
    }
    const limit = Number(digits);
    if (limit < FeedLimits.minLimit || limit > FeedLimits.maxLimit) {
      problems.push(
        `the limit of feed ${namespace} must be a whole number from ${String(FeedLimits.minLimit)} to ${String(FeedLimits.maxLimit)}`,
      );
      continue;
    }
    spec.limit = limit;
  }
  const specs = [...byNamespace].map(([namespace, { url, limit }]) => ({
    namespace,
    url,
    ...(limit === undefined ? {} : { limit }),
  }));
  return { specs, problems: [...new Set(problems)] };
}
