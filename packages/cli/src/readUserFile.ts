import { type FileHandle, open } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./CliError.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";
import { readFileBounded } from "./readFileBounded.js";

/**
 * Reads a file the user named (fixture data, settings): a regular file of at most `maxBytes`, anywhere on disk.
 * Throws `CliError` (exit code 3) `<label> <file> <reason>`, never Node's error text.
 */
export async function readUserFile(
  label: string,
  file: string,
  cwd: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const fail = (reason: string, cause?: unknown): never => {
    throw new CliError(
      ExitCode.input,
      `${label} ${quoteForLog(file)} ${reason}`,
      cause === undefined ? undefined : { cause },
    );
  };
  let handle: FileHandle;
  try {
    handle = await open(path.resolve(cwd, file), "r");
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
    if (stats.size > maxBytes) return fail(`is larger than ${String(maxBytes)} bytes`);
    bytes = await readFileBounded(handle, maxBytes);
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = errnoCode(error);
    if (code === undefined) throw error;
    return fail(`cannot be read (${code})`, error);
  } finally {
    await handle.close();
  }
  if (bytes === undefined) return fail(`is larger than ${String(maxBytes)} bytes`);
  return bytes;
}
