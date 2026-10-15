import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { quoteForLog } from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import { errnoCode } from "./errnoCode.js";
import type { RenderedFile } from "./renderAll.js";

/**
 * Writes the rendered files inside the workspace and returns the outputs whose bytes changed.
 * Everything is checked before the first write: the output folder (and the longest part of it
 * that exists) must resolve inside the workspace by real path, and every existing output must
 * be a regular file, not a link or a folder. A file with the same bytes is left alone (its
 * modification time too); a changed one is written to a temporary file next to it and renamed.
 */
export async function writeOutputs(
  workspace: string,
  outputDir: string,
  files: readonly RenderedFile[],
): Promise<string[]> {
  const root = await realpath(workspace);
  const target = path.resolve(root, outputDir);
  checkInside(root, await realExisting(target), outputDir);
  const pending: { file: RenderedFile; bytes: Uint8Array; full: string }[] = [];
  for (const file of files) {
    const full = path.resolve(root, file.output);
    const bytes = file.bytes;
    const current = await readRegular(full, file.output);
    if (current !== undefined && Buffer.from(current).equals(bytes)) continue;
    pending.push({ file, bytes, full });
  }
  if (pending.length === 0) return [];
  try {
    await mkdir(target, { recursive: true });
  } catch (error) {
    throw outputError(`cannot create the output folder ${quoteForLog(outputDir)}`, error);
  }
  checkInside(root, await realpath(target), outputDir);
  const changed: string[] = [];
  for (const { file, bytes, full } of pending) {
    await replaceFile(full, bytes, file.output);
    changed.push(file.output);
  }
  return changed;
}

async function realExisting(target: string): Promise<string> {
  let current = target;
  for (;;) {
    try {
      return await realpath(current);
    } catch (error) {
      const code = errnoCode(error);
      const parent = path.dirname(current);
      if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === current) {
        throw outputError("the output folder cannot be resolved", error);
      }
      current = parent;
    }
  }
}

function checkInside(root: string, real: string, outputDir: string): void {
  const relative = path.relative(root, real);
  const outside =
    relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (!outside) return;
  throw new ActionError(
    "output",
    `output-dir ${quoteForLog(outputDir)} resolves outside the workspace`,
  );
}

/** The bytes of an existing regular file, `undefined` when nothing is there; else an output error. */
async function readRegular(full: string, name: string): Promise<Uint8Array | undefined> {
  let stats;
  try {
    stats = await lstat(full);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw outputError(`output ${quoteForLog(name)} cannot be checked`, error);
  }
  if (!stats.isFile()) {
    throw new ActionError("output", `output ${quoteForLog(name)} exists and is not a regular file`);
  }
  try {
    return await readFile(full);
  } catch (error) {
    throw outputError(`output ${quoteForLog(name)} cannot be read`, error);
  }
}

async function replaceFile(full: string, bytes: Uint8Array, name: string): Promise<void> {
  const temporary = path.join(
    path.dirname(full),
    `.${path.basename(full)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, full);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw outputError(`cannot write ${quoteForLog(name)}`, error);
  }
}

function outputError(message: string, error: unknown): ActionError {
  const code = errnoCode(error);
  if (code === undefined) throw error;
  return new ActionError("output", `${message} (${code})`);
}
