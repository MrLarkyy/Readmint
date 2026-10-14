import { constants, type FileHandle, open } from "node:fs/promises";
import { AssetPathError } from "./AssetPathError.js";
import { errnoCode } from "./errnoCode.js";
import { resolveAsset, type ResolvedAsset } from "./resolveAsset.js";

/** Bounds of one asset read; the font and image loaders own their limits, there is no default. */
export interface AssetReadLimits {
  /** Largest accepted file in bytes: a positive safe integer. */
  readonly maxBytes: number;
}

const chunkBytes = 64 * 1024;
// Undefined on Windows; there a swapped-in link is caught by the identity check instead.
const noFollow: number | undefined = constants.O_NOFOLLOW;
const gone = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);

/** Resolves `src` inside `designDir` (see `resolveAsset`) and reads it within `limits`. */
export async function readAsset(
  designDir: string,
  src: string,
  limits: AssetReadLimits,
): Promise<Uint8Array> {
  checkLimits(limits);
  return readResolvedAsset(await resolveAsset(designDir, src), limits);
}

/**
 * Reads a resolved asset, refusing a file that was replaced since it was resolved (another file
 * renamed over it, a symlink swapped in) and never reading more than `maxBytes + 1` bytes.
 */
export async function readResolvedAsset(
  asset: ResolvedAsset,
  limits: AssetReadLimits,
): Promise<Uint8Array> {
  checkLimits(limits);
  const handle = await openAsset(asset);
  try {
    const stats = await handle.stat({ bigint: true });
    if (stats.dev !== asset.dev || stats.ino !== asset.ino) {
      throw new AssetPathError("changed", asset.src);
    }
    if (!stats.isFile()) throw new AssetPathError("not-a-file", asset.src);
    if (stats.size > BigInt(limits.maxBytes)) throw tooLarge(asset, limits);
    return await readBounded(handle, asset, limits);
  } finally {
    await handle.close();
  }
}

function checkLimits(limits: AssetReadLimits): void {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
}

async function openAsset(asset: ResolvedAsset): Promise<FileHandle> {
  try {
    return await open(asset.path, constants.O_RDONLY | (noFollow ?? 0));
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    // The file existed as a regular file when it was resolved.
    if (gone.has(code)) throw new AssetPathError("changed", asset.src);
    throw new AssetPathError("unreadable", asset.src, code);
  }
}

// The file can still grow after fstat; the loop asks for at most maxBytes + 1 bytes in total.
async function readBounded(
  handle: FileHandle,
  asset: ResolvedAsset,
  limits: AssetReadLimits,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const chunk = new Uint8Array(Math.min(chunkBytes, limits.maxBytes + 1 - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
    if (total > limits.maxBytes) throw tooLarge(asset, limits);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function tooLarge(asset: ResolvedAsset, limits: AssetReadLimits): AssetPathError {
  return new AssetPathError("too-large", asset.src, String(limits.maxBytes));
}
