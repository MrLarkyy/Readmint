/** The Action version that introduced each expression filter the templates may use; add a filter here when a release adds one. */
const filterIntroducedIn: Readonly<Record<string, string>> = {
  textWidth: "0.3.0",
  truncateWidth: "0.3.0",
};

type Version = readonly [number, number, number];

const parse = (text: string): Version => {
  const [major = 0, minor = 0, patch = 0] = text.split(".").map(Number);
  return [major, minor, patch];
};
const isOlder = (a: Version, b: Version): boolean => {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
};

/**
 * Throws when `actionRef` pins a full `vX.Y.Z` tag older than a filter a design uses (`| name`). Other references
 * (`@main`, `@v0`, a commit) are not compared.
 */
export function assertActionSupportsDesigns(
  actionRef: string,
  designs: readonly { readonly file: string; readonly text: string }[],
): void {
  const pinned = /@v(\d+\.\d+\.\d+)$/.exec(actionRef)?.[1];
  if (pinned === undefined) return;
  for (const { file, text } of designs) {
    for (const [filter, introduced] of Object.entries(filterIntroducedIn)) {
      if (
        new RegExp(String.raw`\|\s*${filter}\b`).test(text) &&
        isOlder(parse(pinned), parse(introduced))
      ) {
        throw new Error(
          `${actionRef} predates ${filter} (Action v${introduced}), which ${file} uses; pin v${introduced} or newer`,
        );
      }
    }
  }
}
