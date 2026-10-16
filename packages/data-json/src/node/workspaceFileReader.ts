import type { BigIntStats } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { DataSourceError, type DataSourceCommonErrorCode } from "@readmint/data";
import { checkRelativeSource } from "../checkRelativeSource.js";
import { JSON_DATA_DEFAULT_NAMESPACE } from "../JsonData.js";
import type { JsonFileReader } from "../JsonSourceOptions.js";

const CHUNK_BYTES = 64 * 1024;

/**
 * A file reader confined to `root`: the relative path is checked, then the root and the target are
 * resolved through every link and junction, and the target must stay inside the root. The file
 * opened must be the regular file that was checked (same device and inode), so a swap between the
 * check and the open is refused. Errors quote the relative path, never the root.
 */
export function workspaceFileReader(root: string): JsonFileReader {
  return async (relative, maxBytes) => {
    const quoted = JSON.stringify(relative);
    const fail = (code: DataSourceCommonErrorCode, reason: string) =>
      new DataSourceError(JSON_DATA_DEFAULT_NAMESPACE, code, `The JSON file ${quoted} ${reason}.`);
    const problem = checkRelativeSource(relative);
    if (problem !== undefined) throw fail("invalid-option", problem);

    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch (error) {
      throw new DataSourceError(
        JSON_DATA_DEFAULT_NAMESPACE,
        "invalid-option",
        `The root for JSON files cannot be resolved (${errnoCode(error) ?? "error"}).`,
      );
    }
    const target = await settle(realpath(path.resolve(realRoot, relative)), fail);
    const inside = path.relative(realRoot, target);
    if (
      inside === "" ||
      path.isAbsolute(inside) ||
      inside === ".." ||
      inside.startsWith(`..${path.sep}`)
    ) {
      throw fail("forbidden", "resolves outside the root");
    }
    const checked = await settle(lstat(target, { bigint: true }), fail);
    if (!checked.isFile()) throw fail("invalid-option", "is not a regular file");
    if (checked.size > BigInt(maxBytes)) {
      throw fail("too-large", `is larger than ${String(maxBytes)} bytes`);
    }

    const handle = await settle(open(target, "r"), fail);
    try {
      const opened = await settle(handle.stat({ bigint: true }), fail);
      if (!sameFile(checked, opened)) throw fail("forbidden", "changed while it was opened");
      const bytes = await settle(readBounded(handle, maxBytes), fail);
      if (bytes === undefined) throw fail("too-large", `is larger than ${String(maxBytes)} bytes`);
      return bytes;
    } finally {
      await handle.close().catch(() => undefined);
    }
  };
}

async function settle<T>(
  promise: Promise<T>,
  fail: (code: DataSourceCommonErrorCode, reason: string) => DataSourceError,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DataSourceError) throw error;
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") throw fail("not-found", "does not exist");
    if (code === "EACCES" || code === "EPERM") throw fail("forbidden", "cannot be read");
    throw fail("invalid-option", `cannot be read (${code ?? "error"})`);
  }
}

function sameFile(checked: BigIntStats, opened: BigIntStats): boolean {
  return opened.isFile() && opened.dev === checked.dev && opened.ino === checked.ino;
}

// Never reads past maxBytes + 1, whatever the file grows to after the size check.
async function readBounded(handle: FileHandle, maxBytes: number): Promise<Uint8Array | undefined> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const chunk = new Uint8Array(Math.min(CHUNK_BYTES, maxBytes + 1 - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
    if (total > maxBytes) return undefined;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// The system code only ("ENOENT"): Node's message embeds absolute paths.
function errnoCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" && /^(?!ERR_)[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined;
}
