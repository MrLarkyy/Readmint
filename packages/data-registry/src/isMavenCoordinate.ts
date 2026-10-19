const COORDINATE = /^([A-Za-z0-9_.-]{1,128}):([A-Za-z0-9_.-]{1,128})$/;
const DOTS_ONLY = /^\.+$/;

/**
 * Whether `value` is `group:artifact`, each part 1 to 128 of letters, digits, `_`, `.` and `-`. The group becomes a
 * path (`a.b` is `a/b`), so none of its dot-separated parts may be empty, and no part of the path, the artifact
 * included, may be only dots (`.` or `..` would climb out of the repository).
 */
export function isMavenCoordinate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = COORDINATE.exec(value);
  const [, group = "", artifact = ""] = match ?? [];
  if (match === null || DOTS_ONLY.test(artifact)) return false;
  return group.split(".").every((part) => part !== "" && !DOTS_ONLY.test(part));
}
