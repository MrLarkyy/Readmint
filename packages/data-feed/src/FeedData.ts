import type { DataObject } from "@readmint/data";

/** Version of the feed data object; it changes only with a breaking change to its shape. */
export const FEED_DATA_VERSION = 0;

/** Namespace a feed source binds under when the host names none. */
export const FEED_DATA_DEFAULT_NAMESPACE = "feed";

/** One entry: plain text, capped; a missing text or an unusable link is `""`. */
export interface FeedEntry {
  readonly title: string;
  /** An absolute http(s) URL, or `""`. */
  readonly link: string;
  /** UTC ISO 8601 (`2026-10-16T12:00:00.000Z`), or `null` when absent or unreadable. */
  readonly published: string | null;
  readonly summary: string;
}

/** What a feed source binds: the feed's title and link, and its newest entries first. */
export interface FeedData extends DataObject {
  readonly version: typeof FEED_DATA_VERSION;
  readonly title: string;
  readonly link: string;
  readonly entries: readonly FeedEntry[];
}
