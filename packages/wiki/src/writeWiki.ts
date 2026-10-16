import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildWiki, type WikiOptions } from "./buildWiki.js";
import { galleryImagePath } from "./galleryImagePath.js";
import { galleryTemplates } from "./galleryTemplates.js";

/**
 * Reads docs/*.md from `docsDir` and the gallery's golden PNGs from `goldenDir` (by the gallery list, no directory
 * scan), builds the wiki and replaces the Markdown files and the gallery/ folder of `outDir` with it; nothing else in
 * `outDir` is touched.
 */
export function writeWiki(
  docsDir: string,
  outDir: string,
  options: Omit<WikiOptions, "images">,
  goldenDir = join(docsDir, "..", "packages", "components", "test", "golden"),
): string[] {
  const docs = new Map<string, string>();
  for (const file of readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()) {
    docs.set(file, readFileSync(join(docsDir, file), "utf8"));
  }
  const images = new Map<string, Uint8Array>();
  for (const template of options.gallery ?? galleryTemplates) {
    for (const item of template.items) {
      for (const theme of ["light", "dark"] as const) {
        const path = galleryImagePath(template, item, theme);
        const file = join(goldenDir, path);
        // A missing golden is reported by the generator, which names the path.
        if (existsSync(file)) images.set(path, readFileSync(file));
      }
    }
  }
  const files = buildWiki(docs, { ...options, images });
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir).filter((name) => name.endsWith(".md"))) {
    rmSync(join(outDir, file));
  }
  rmSync(join(outDir, "gallery"), { recursive: true, force: true });
  for (const [file, content] of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return [...files.keys()];
}
