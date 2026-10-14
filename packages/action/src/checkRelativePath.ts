/**
 * Why a path from an input cannot name a place inside the workspace, or `undefined` when it can:
 * it must be relative, `/`- or `\`-separated, without `..` segments or control characters. Links
 * are checked where the path is used.
 */
export function checkRelativePath(text: string): string | undefined {
  if (text === "") return "is empty";
  // eslint-disable-next-line no-control-regex -- control characters are what is refused here
  if (/[\u0000-\u001f\u007f]/.test(text)) return "contains a control character";
  if (/^[\\/]/.test(text) || /^[A-Za-z]:/.test(text)) return "is not a relative path";
  if (text.split(/[\\/]/).some((segment) => segment === "..")) return "leaves the workspace (..)";
  return undefined;
}
