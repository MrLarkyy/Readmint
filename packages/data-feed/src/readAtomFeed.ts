import type { RawFeed, RawFeedEntry, RawText } from "./RawFeed.js";
import type { XmlElement } from "./XmlElement.js";
import { childElement, childElements, textContent } from "./xmlQuery.js";

export const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";

/**
 * Reads an Atom 1.0 `<feed>`. Text constructs follow their `type` (`text`, `html`, `xhtml`); the
 * link is the first `rel="alternate"` one or one without `rel`; the summary falls back to inline
 * `content`, `published` to `updated`.
 */
export function readAtomFeed(feed: XmlElement): RawFeed {
  return {
    title: textConstruct(atomChild(feed, "title")),
    link: alternateLink(feed),
    entries: childElements(feed, ATOM_NAMESPACE, "entry").map(readEntry),
  };
}

function readEntry(entry: XmlElement): RawFeedEntry {
  const summary = atomChild(entry, "summary") ?? inlineContent(atomChild(entry, "content"));
  const date = atomChild(entry, "published") ?? atomChild(entry, "updated");
  return {
    title: textConstruct(atomChild(entry, "title")),
    link: alternateLink(entry),
    date: date === undefined ? "" : textContent(date).trim(),
    summary: textConstruct(summary),
  };
}

function atomChild(parent: XmlElement, name: string): XmlElement | undefined {
  return childElement(parent, ATOM_NAMESPACE, name);
}

/** Content given by `src` or as another media type has no text to show. */
function inlineContent(content: XmlElement | undefined): XmlElement | undefined {
  if (content === undefined || content.attributes.has("src")) return undefined;
  const type = content.attributes.get("type")?.trim().toLowerCase() ?? "text";
  return type === "text" || type === "html" || type === "xhtml" ? content : undefined;
}

function alternateLink(parent: XmlElement): string {
  for (const link of childElements(parent, ATOM_NAMESPACE, "link")) {
    const rel = link.attributes.get("rel")?.trim() ?? "alternate";
    if (rel === "alternate") return link.attributes.get("href")?.trim() ?? "";
  }
  return "";
}

function textConstruct(element: XmlElement | undefined): RawText {
  if (element === undefined) return { value: "", html: false };
  const type = element.attributes.get("type")?.trim().toLowerCase() ?? "text";
  if (type === "html") return { value: textContent(element), html: true };
  if (type === "xhtml") {
    const div = childElement(element, "http://www.w3.org/1999/xhtml", "div");
    return { value: div === undefined ? "" : textContent(div, true), html: false };
  }
  return { value: textContent(element), html: false };
}
