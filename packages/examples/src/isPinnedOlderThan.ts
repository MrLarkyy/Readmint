const parse = (text: string): number[] => text.split(".").map(Number);

/** Whether `actionRef` pins a full `vX.Y.Z` tag older than `version`; other references (`@main`, `@v0`, a commit) are not compared. */
export function isPinnedOlderThan(actionRef: string, version: string): boolean {
  const pinned = /@v(\d+\.\d+\.\d+)$/.exec(actionRef)?.[1];
  if (pinned === undefined) return false;
  const a = parse(pinned);
  const b = parse(version);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
