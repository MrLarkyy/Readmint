import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExampleFile } from "./ExampleFile.js";
import { generatedFiles } from "./generatedFiles.js";

export interface ExampleDifference {
  readonly path: string;
  readonly kind: "missing" | "differs" | "stale";
}

/** How the generated files of the examples repository at `out` differ from `files`; nothing is written. */
export function compareExamples(out: string, files: readonly ExampleFile[]): ExampleDifference[] {
  const differences: ExampleDifference[] = [];
  for (const { path, content } of files) {
    const target = join(out, path);
    if (!existsSync(target)) differences.push({ path, kind: "missing" });
    else if (!readFileSync(target).equals(Buffer.from(content))) {
      differences.push({ path, kind: "differs" });
    }
  }
  const wanted = new Set(files.map((file) => file.path));
  for (const path of generatedFiles(out)) {
    if (!wanted.has(path)) differences.push({ path, kind: "stale" });
  }
  return differences.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
