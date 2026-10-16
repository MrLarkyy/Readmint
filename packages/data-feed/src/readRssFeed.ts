import { DataSourceError } from "@readmint/data";
import type { RawFeed, RawFeedEntry, RawText } from "./RawFeed.js";
import type { XmlElement } from "./XmlElement.js";
import { childElement, childElements, textContent } from "./xmlQuery.js";

const CONTENT_NAMESPACE = "http://purl.org/rss/1.0/modules/content/";
const DUBLIN_CORE_NAMESPACE = "http://purl.org/dc/elements/1.1/";

/**
 * Reads an RSS 2.0 `<rss><channel>`. Titles and descriptions are taken as HTML: RSS does not say,
 * and feeds commonly escape markup into both. An item's link falls back to its `guid` unless that
 * is `isPermaLink="false"`, its description to `content:encoded`, its `pubDate` to `dc:date`.
 */
export function readRssFeed(rss: XmlElement, namespace: string): RawFeed {
  const channel = childElement(rss, "", "channel");
  if (channel === undefined) {
    throw new DataSourceError(namespace, "invalid-response", "The RSS feed has no channel.");
  }
  return {
    title: html(childElement(channel, "", "title")),
    link: text(childElement(channel, "", "link")),
    entries: childElements(channel, "", "item").map(readItem),
  };
}

function readItem(item: XmlElement): RawFeedEntry {
  const description =
    childElement(item, "", "description") ?? childElement(item, CONTENT_NAMESPACE, "encoded");
  const date =
    childElement(item, "", "pubDate") ?? childElement(item, DUBLIN_CORE_NAMESPACE, "date");
  return {
    title: html(childElement(item, "", "title")),
    link: text(childElement(item, "", "link")) || guidLink(item),
    date: text(date),
    summary: html(description),
  };
}

function guidLink(item: XmlElement): string {
  const guid = childElement(item, "", "guid");
  if (guid === undefined) return "";
  return guid.attributes.get("isPermaLink")?.trim().toLowerCase() === "false" ? "" : text(guid);
}

function text(element: XmlElement | undefined): string {
  return element === undefined ? "" : textContent(element).trim();
}

function html(element: XmlElement | undefined): RawText {
  return { value: element === undefined ? "" : textContent(element), html: true };
}
