import { GitHubDataError } from "./GitHubDataError.js";
import type { RepositoriesPageRecord } from "./GitHubRecords.js";

/**
 * The cursor that continues after `page`. A missing or already used cursor would make the
 * pagination loop forever, so it fails the load instead.
 */
export function nextPageCursor(page: RepositoriesPageRecord, used: Set<string>): string {
  const cursor = page.endCursor;
  if (cursor === null || cursor === "") {
    throw new GitHubDataError("invalid-response", "GitHub announced a next page without a cursor.");
  }
  if (used.has(cursor)) {
    throw new GitHubDataError("invalid-response", "GitHub returned a page cursor twice.");
  }
  used.add(cursor);
  return cursor;
}

/** The same rules over a stored chain of pages: every page but the last continues. */
export function checkPageChain(pages: readonly RepositoriesPageRecord[]): void {
  const used = new Set<string>();
  for (const page of pages.slice(0, -1)) {
    if (!page.hasNextPage) {
      throw new GitHubDataError("invalid-response", "A stored page chain continues past its end.");
    }
    nextPageCursor(page, used);
  }
}
