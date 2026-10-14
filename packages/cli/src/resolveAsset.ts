import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AssetPathError } from "./AssetPathError.js";
import { findAssetPathIssue } from "./checkAssetPath.js";
import { errnoCode } from "./errnoCode.js";

/** An asset source resolved to a regular file inside the design folder. */
export interface ResolvedAsset {
  readonly src: string;
  /** Real path (symlinks resolved); never put it into a message, it can reach Action logs. */
  readonly path: string;
  /** Identity at resolve time; `readResolvedAsset` refuses a file that is no longer this one. */
  readonly dev: bigint;
  readonly ino: bigint;
}

const missing = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);

/**
 * Resolves a relative asset source against the design folder: lexical rules first, then the real
 * paths of the folder and the target (symlinks, junctions, short names) must nest. Throws
 * `AssetPathError`; errors resolving `designDir` itself propagate, they are the caller's.
 */
export async function resolveAsset(designDir: string, src: string): Promise<ResolvedAsset> {
  const issue = findAssetPathIssue(src);
  if (issue !== undefined) throw new AssetPathError(issue.code, src, issue.device);
  const root = await realpath(designDir);
  const target = await asAssetFault(realpath(path.resolve(root, ...src.split("/"))), src);
  if (!isInside(root, target)) throw new AssetPathError("outside", src);
  const stats = await asAssetFault(stat(target, { bigint: true }), src);
  if (!stats.isFile()) throw new AssetPathError("not-a-file", src);
  return { src, path: target, dev: stats.dev, ino: stats.ino };
}

async function asAssetFault<T>(operation: Promise<T>, src: string): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw toAssetError(error, src);
  }
}

// path.relative, not a string prefix: "/a/design2" starts with "/a/design" but is outside it.
function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function toAssetError(error: unknown, src: string): unknown {
  const code = errnoCode(error);
  if (code === undefined) return error;
  return missing.has(code)
    ? new AssetPathError("not-found", src)
    : new AssetPathError("unreadable", src, code);
}
