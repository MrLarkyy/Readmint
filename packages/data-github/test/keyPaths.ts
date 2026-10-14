/**
 * Every key path of a JSON value, array items written as `[]` (`repositories[].name`); object
 * keys are merged over all items, so one item with a non-null value is enough to list a child.
 */
export function keyPaths(value: unknown): string[] {
  const paths = new Set<string>();
  visit(value, "", paths);
  return [...paths];
}

function visit(value: unknown, path: string, paths: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) visit(item, `${path}[]`, paths);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    paths.add(childPath);
    visit(child, childPath, paths);
  }
}
