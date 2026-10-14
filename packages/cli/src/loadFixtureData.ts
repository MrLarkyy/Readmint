import { type FileHandle, open } from "node:fs/promises";
import path from "node:path";
import { isDataNamespace } from "@readmint/data";
import { CliError } from "./CliError.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";
import { readFileBounded } from "./readFileBounded.js";

/** Largest fixture data file in bytes. */
export const maxFixtureBytes = 8 * 1024 * 1024;

/**
 * Reads fixture data: a JSON object whose keys are data namespaces (`isDataNamespace`), as the
 * data sources would provide it. A local file of the user's, so not confined to a folder; no
 * network, no token. Throws `CliError` (exit code 3) naming the file and the reason, never the
 * JSON parser's message (it quotes the data).
 */
export async function loadFixtureData(
  dataPath: string,
  cwd: string,
): Promise<Record<string, unknown>> {
  const fail = (reason: string, cause?: unknown): never => {
    throw new CliError(
      ExitCode.input,
      `fixture data ${quoteForLog(dataPath)} ${reason}`,
      cause === undefined ? undefined : { cause },
    );
  };
  let handle: FileHandle;
  try {
    handle = await open(path.resolve(cwd, dataPath), "r");
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    return fail(
      code === "ENOENT" || code === "ENOTDIR" ? "does not exist" : `cannot be read (${code})`,
      error,
    );
  }
  let bytes: Uint8Array | undefined;
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return fail("is not a regular file");
    if (stats.size > maxFixtureBytes)
      return fail(`is larger than ${String(maxFixtureBytes)} bytes`);
    bytes = await readFileBounded(handle, maxFixtureBytes);
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = errnoCode(error);
    if (code === undefined) throw error;
    return fail(`cannot be read (${code})`, error);
  } finally {
    await handle.close();
  }
  if (bytes === undefined) return fail(`is larger than ${String(maxFixtureBytes)} bytes`);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("is not valid UTF-8 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("must be a JSON object of data namespaces");
  }
  for (const key of Object.keys(value)) {
    if (!isDataNamespace(key)) {
      return fail(
        `has the key ${quoteForLog(key)}, which is not a data namespace (a lowercase letter, then up to 31 lowercase letters or digits)`,
      );
    }
  }
  return value as Record<string, unknown>;
}
