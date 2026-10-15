import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExampleFile } from "./ExampleFile.js";
import { generatedFiles } from "./generatedFiles.js";

/** Writes `files` into the examples repository at `out` and removes the generated files that are no longer produced. */
export function writeExamples(
  out: string,
  files: readonly ExampleFile[],
): { written: number; removed: string[] } {
  const wanted = new Set(files.map((file) => file.path));
  const removed = generatedFiles(out).filter((path) => !wanted.has(path));
  for (const path of removed) rmSync(join(out, path));
  for (const { path, content } of files) {
    const target = join(out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { written: files.length, removed };
}
