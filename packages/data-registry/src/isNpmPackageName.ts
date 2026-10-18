const NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const RESERVED = new Set(["node_modules", "favicon.ico"]);

/**
 * Whether `value` is a name npm accepts for a new package: at most 214 characters, lowercase, URL-safe, with an
 * optional `@scope/` prefix. Legacy names (uppercase, spaces) are refused: nothing reaches a URL unchecked.
 */
export function isNpmPackageName(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 214 || !NAME.test(value)) return false;
  return !RESERVED.has(value.slice(value.lastIndexOf("/") + 1));
}
