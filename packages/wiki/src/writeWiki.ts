import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWiki, type WikiOptions } from "./buildWiki.js";

/** Reads docs/*.md from `docsDir`, builds the wiki and replaces the Markdown files of `outDir` with it. */
export function writeWiki(docsDir: string, outDir: string, options: WikiOptions): string[] {
  const docs = new Map<string, string>();
  for (const file of readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()) {
    docs.set(file, readFileSync(join(docsDir, file), "utf8"));
  }
  const files = buildWiki(docs, options);
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir).filter((name) => name.endsWith(".md"))) {
    rmSync(join(outDir, file));
  }
  for (const [file, text] of files) writeFileSync(join(outDir, file), text);
  return [...files.keys()];
}
