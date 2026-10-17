import path from "node:path";

/**
 * Why `text` (the `cache-dir` input, absolute or relative to `workspace`) cannot be the cache folder, or `undefined`
 * when it can. The folder must lie outside the workspace: a later commit or Pages step could publish what is inside.
 * `~` is not expanded, so it is refused instead of becoming a folder of that name.
 */
export function cacheDirProblem(text: string, workspace: string): string | undefined {
  if (text.startsWith("~")) return "starts with ~, which is not expanded (use an absolute path)";
  const directory = path.resolve(workspace, text);
  if (within(directory, workspace))
    return "is the workspace or inside it (use a folder outside it, such as runner.temp)";
  return undefined;
}

function fold(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function within(directory: string, parent: string): boolean {
  const relative = fold(path.relative(path.resolve(parent), directory));
  if (relative === "") return true;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
}
