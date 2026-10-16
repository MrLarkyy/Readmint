import { type FileHandle, open } from "node:fs/promises";
import path from "node:path";
import { type DesignProps, DesignLimits, parseDesignProps } from "@readmint/format";
import { CliError } from "./CliError.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { quoteForLog } from "./quoteForLog.js";
import { readFileBounded } from "./readFileBounded.js";

// Every UTF-16 unit of the largest source the format takes is at most 3 UTF-8 bytes; plus a byte order mark.
const maxPropsBytes = 3 * DesignLimits.maxSourceLength + 3;

/**
 * Reads a settings file (`--props`, `props-file`): JSON, root props by section. A local file of the user's, so not
 * confined to a folder. Throws `CliError`: exit code 3 when it cannot be read, 1 when its content is invalid; a
 * message names the file and the pointer, never a value.
 */
export async function loadDesignProps(propsPath: string, cwd: string): Promise<DesignProps> {
  const file = quoteForLog(propsPath);
  const unreadable = (reason: string, cause?: unknown): never => {
    throw new CliError(
      ExitCode.input,
      `settings file ${file} ${reason}`,
      cause === undefined ? undefined : { cause },
    );
  };
  let handle: FileHandle;
  try {
    handle = await open(path.resolve(cwd, propsPath), "r");
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    return unreadable(
      code === "ENOENT" || code === "ENOTDIR" ? "does not exist" : `cannot be read (${code})`,
      error,
    );
  }
  let bytes: Uint8Array | undefined;
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return unreadable("is not a regular file");
    if (stats.size > maxPropsBytes)
      return unreadable(`is larger than ${String(maxPropsBytes)} bytes`);
    bytes = await readFileBounded(handle, maxPropsBytes);
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = errnoCode(error);
    if (code === undefined) throw error;
    return unreadable(`cannot be read (${code})`, error);
  } finally {
    await handle.close();
  }
  if (bytes === undefined) return unreadable(`is larger than ${String(maxPropsBytes)} bytes`);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(
      ExitCode.invalid,
      `settings file ${file}: error parse at /: not valid UTF-8`,
    );
  }
  const result = parseDesignProps(source);
  if (result.ok) return result.value;
  const lines = result.issues.map((issue) => formatIssue(`settings file ${file}`, issue, "error"));
  if (result.truncated) lines.push(`settings file ${file}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
}
