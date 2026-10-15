import { searchDirs } from "./findExecutable.js";

const libraryPathKeys = ["LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH"];

/**
 * `env` with the POSIX loader search variables reduced to their absolute entries outside `cwd`, as written and in
 * order: an empty or relative entry would resolve against the workspace once git works there. A variable left
 * without an entry is dropped. On win32 `env` is copied unchanged.
 */
export function withLibraryPaths<V extends string | undefined>(
  env: Readonly<Record<string, V>>,
  options: { readonly platform: NodeJS.Platform; readonly cwd: string },
): Record<string, V> {
  if (options.platform === "win32") return { ...env };
  const result: Record<string, V> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!libraryPathKeys.includes(name) || value === undefined) {
      result[name] = value;
      continue;
    }
    const kept = searchDirs(options.platform, value, options.cwd).map(({ raw }) => raw);
    // `V` includes `string`: the value replaces a defined one.
    if (kept.length > 0) result[name] = kept.join(":") as V;
  }
  return result;
}
