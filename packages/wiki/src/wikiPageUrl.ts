import type { WikiEntry } from "./WikiPage.js";

/** The URL of a wiki page, with the heading anchor when one is given. `repository` has no trailing slash. */
export function wikiPageUrl(repository: string, page: WikiEntry, anchor?: string): string {
  const url = `${repository}/wiki/${page.name}`;
  return anchor === undefined ? url : `${url}#${anchor}`;
}
