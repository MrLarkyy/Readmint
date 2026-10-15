import { setTimeout as sleep } from "node:timers/promises";
import { AssetPathError } from "./AssetPathError.js";
import { CliError } from "./CliError.js";

/** Reads a save can race: the first and three retries, after 25, 50 and 75 ms. */
export const changedReadAttempts = 4;

/**
 * Runs `load` again while it fails only because a file changed while it was being read: an editor's atomic save
 * (write a temporary file, rename it over the design or an asset) that lands between resolving a file and reading
 * it. After `changedReadAttempts` the last failure is the result; any other failure is at once.
 */
export async function retryWhileChanging<T>(
  load: () => Promise<T>,
  pause: (ms: number) => Promise<unknown> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= changedReadAttempts || !changedWhileRead(error)) throw error;
      await pause(25 * attempt);
    }
  }
}

function changedWhileRead(error: unknown): boolean {
  const cause = error instanceof CliError ? error.cause : error;
  return cause instanceof AssetPathError && cause.code === "changed";
}
