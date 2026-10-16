import { FEED_DATA_VERSION, type FeedData, type FeedEntry } from "./FeedData.js";
import { feedLink } from "./feedLink.js";
import { FeedLimits } from "./FeedSourceOptions.js";
import { htmlToText } from "./htmlToText.js";
import { parseFeedDate } from "./parseFeedDate.js";
import { plainText } from "./plainText.js";
import type { RawFeed, RawFeedEntry, RawText } from "./RawFeed.js";

interface Dated {
  readonly entry: RawFeedEntry;
  readonly published: string | null;
  readonly order: number;
}

/**
 * The frozen data object of a read feed: entries sorted newest first (dated before undated,
 * equal dates in document order), then the first `limit` kept, then their texts and links
 * converted. Same feed and limit, same object.
 */
export function buildFeedData(feed: RawFeed, base: URL, limit: number): FeedData {
  const dated: Dated[] = feed.entries.map((entry, order) => ({
    entry,
    published: parseFeedDate(entry.date),
    order,
  }));
  dated.sort(newestFirst);
  const linkBase = withoutQuery(base);
  const entries = dated.slice(0, limit).map(({ entry, published }) =>
    Object.freeze<FeedEntry>({
      title: text(entry.title, FeedLimits.titleLength),
      link: feedLink(entry.link, linkBase),
      published,
      summary: text(entry.summary, FeedLimits.summaryLength),
    }),
  );
  return Object.freeze({
    version: FEED_DATA_VERSION,
    title: text(feed.title, FeedLimits.titleLength),
    link: feedLink(feed.link, linkBase),
    entries: Object.freeze(entries),
  });
}

// A fragment-only link (`#top`) keeps its base's query, which may hold a key of the feed URL.
function withoutQuery(url: URL): URL {
  const base = new URL(url.href);
  base.search = "";
  base.hash = "";
  return base;
}

// ISO strings of years 1970 to 9999 in one format sort as the instants they name.
function newestFirst(a: Dated, b: Dated): number {
  if (a.published !== b.published) {
    if (a.published === null) return 1;
    if (b.published === null) return -1;
    return a.published < b.published ? 1 : -1;
  }
  return a.order - b.order;
}

function text(raw: RawText, maxLength: number): string {
  return plainText(raw.html ? htmlToText(raw.value) : raw.value, maxLength);
}
