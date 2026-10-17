import path from "node:path";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";

/**
 * The absolute folder of the `cache-dir` input (relative to the workspace), or `undefined` without one. The cache holds
 * data the token could read, so it must not be the workspace itself nor sit at or inside `output-dir`, which is often
 * committed or published.
 */
export function resolveCacheDir(config: ActionConfig, workspace: string): string | undefined {
  if (config.cacheDir === undefined) return undefined;
  const directory = path.resolve(workspace, config.cacheDir);
  if (same(directory, workspace)) {
    throw new ActionError("input", "input cache-dir cannot be the workspace itself");
  }
  if (within(directory, path.resolve(workspace, config.outputDir))) {
    throw new ActionError("input", "input cache-dir cannot be at or inside output-dir");
  }
  return directory;
}

function fold(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function same(a: string, b: string): boolean {
  return fold(path.relative(a, b)) === "";
}

function within(directory: string, parent: string): boolean {
  const relative = fold(path.relative(fold(parent), fold(directory)));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
