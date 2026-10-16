import { isPinnedOlderThan } from "./isPinnedOlderThan.js";

/** The Action version that introduced each expression filter the templates may use; add a filter here when a release adds one. */
const filterIntroducedIn: Readonly<Record<string, string>> = {
  textWidth: "0.3.0",
  truncateWidth: "0.3.0",
};

/**
 * Throws when `actionRef` pins a full `vX.Y.Z` tag older than a filter a design uses (`| name`). Other references
 * (`@main`, `@v0`, a commit) are not compared.
 */
export function assertActionSupportsDesigns(
  actionRef: string,
  designs: readonly { readonly file: string; readonly text: string }[],
): void {
  for (const { file, text } of designs) {
    for (const [filter, introduced] of Object.entries(filterIntroducedIn)) {
      if (
        new RegExp(String.raw`\|\s*${filter}\b`).test(text) &&
        isPinnedOlderThan(actionRef, introduced)
      ) {
        throw new Error(
          `${actionRef} predates ${filter} (Action v${introduced}), which ${file} uses; pin v${introduced} or newer`,
        );
      }
    }
  }
}
