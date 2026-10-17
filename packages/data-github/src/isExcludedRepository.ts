/**
 * True when the lowercased `excluded` names hold the repository's name or its `owner/name`
 * (case-insensitive, as GitHub names are).
 */
export function isExcludedRepository(
  name: string,
  nameWithOwner: string,
  excluded: ReadonlySet<string>,
): boolean {
  return excluded.has(name.toLowerCase()) || excluded.has(nameWithOwner.toLowerCase());
}
