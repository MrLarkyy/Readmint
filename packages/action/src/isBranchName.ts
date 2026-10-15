/**
 * Whether `name` passes the rules of `git check-ref-format --branch` that do not need a
 * repository: checked before anything runs, and by git itself again before the push.
 */
export function isBranchName(name: string): boolean {
  if (name === "" || name === "@" || name.length > 255) return false;
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- control characters are not allowed in ref names
  if (/[\u0000-\u0020\u007f~^:?*[\\]|\.\.|\/\/|@\{/.test(name)) return false;
  return name.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}
