import { isPinnedOlderThan } from "./isPinnedOlderThan.js";

/** The Action version that introduced each expression filter the templates may use; add a filter here when a release adds one. */
const filterIntroducedIn: Readonly<Record<string, string>> = {
  textWidth: "0.3.0",
  truncateWidth: "0.3.0",
};

/**
 * The Action version that accepts each design property format v0 gained after a release; an older Action refuses a
 * design using it as `unknown-property`. Add a property here in the change that adds it to the format.
 */
const propertyIntroducedIn: Readonly<Record<string, string>> = {
  maxLines: "0.4.0",
};

const uses = [
  ...Object.entries(filterIntroducedIn).map(([name, introduced]) => ({
    name,
    introduced,
    pattern: new RegExp(String.raw`\|\s*${name}\b`),
  })),
  ...Object.entries(propertyIntroducedIn).map(([name, introduced]) => ({
    name,
    introduced,
    pattern: new RegExp(String.raw`"${name}"\s*:`),
  })),
];

/**
 * Throws when `actionRef` pins a full `vX.Y.Z` tag older than a filter (`| name`) or a design property (`"name":`) a
 * design uses. Other references (`@main`, `@v0`, a commit) are not compared.
 */
export function assertActionSupportsDesigns(
  actionRef: string,
  designs: readonly { readonly file: string; readonly text: string }[],
): void {
  for (const { file, text } of designs) {
    for (const { name, introduced, pattern } of uses) {
      if (pattern.test(text) && isPinnedOlderThan(actionRef, introduced)) {
        throw new Error(
          `${actionRef} predates ${name} (Action v${introduced}), which ${file} uses; pin v${introduced} or newer`,
        );
      }
    }
  }
}
