import { stat } from "node:fs/promises";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";

/**
 * Refuses a cache directory that exists and is not a folder, before any request: the cache is best effort, so a file
 * at the path would otherwise make it silently do nothing. A missing path is fine (the cache creates it).
 */
export async function checkCacheDir(directory: string): Promise<void> {
  try {
    if (!(await stat(directory)).isDirectory()) {
      throw new CliError(
        ExitCode.input,
        `cache directory ${quoteForLog(directory)} is not a folder`,
      );
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw new CliError(
      ExitCode.input,
      `cache directory ${quoteForLog(directory)} cannot be read${typeof code === "string" ? ` (${code})` : ""}`,
    );
  }
}
