/** A text as the feed gives it: plain text, or HTML still to be turned into text. */
export interface RawText {
  readonly value: string;
  readonly html: boolean;
}

/** One entry as read from RSS or Atom, before text conversion, date parsing and links. */
export interface RawFeedEntry {
  readonly title: RawText;
  /** As written, possibly relative; `""` when absent. */
  readonly link: string;
  /** As written; `""` when absent. */
  readonly date: string;
  readonly summary: RawText;
}

/** What `readFeed` reads from either format. */
export interface RawFeed {
  readonly title: RawText;
  readonly link: string;
  readonly entries: readonly RawFeedEntry[];
}
