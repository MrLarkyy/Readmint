import { DataSourceError } from "@readmint/data";
import type { RawFeed } from "./RawFeed.js";
import { ATOM_NAMESPACE, readAtomFeed } from "./readAtomFeed.js";
import { readRssFeed } from "./readRssFeed.js";
import type { XmlElement } from "./XmlElement.js";

/** Reads an RSS 2.0 `<rss>` or an Atom 1.0 `<feed>` root; any other root (RSS 1.0 RDF too) is refused. */
export function readFeed(root: XmlElement, namespace: string): RawFeed {
  if (root.namespace === "" && root.name === "rss") return readRssFeed(root, namespace);
  if (root.namespace === ATOM_NAMESPACE && root.name === "feed") return readAtomFeed(root);
  throw new DataSourceError(
    namespace,
    "invalid-response",
    "The feed document is not an RSS 2.0 or Atom 1.0 feed.",
  );
}
