import { type PictureEntry, pictureHtml } from "@readmint/cli";
import type { PlannedDesign } from "./PlannedDesign.js";
import type { PlannedFile } from "./PlannedFile.js";
import type { RenderedFile } from "./renderAll.js";

/**
 * The README HTML for the planned designs, in their order: a `<picture>` per design whose `<img>`
 * shows the light output and, when the design has a dark twin, a `<source>` that switches to the
 * dark output under `prefers-color-scheme: dark`. Each shows the first listed format; a raster
 * `<img>` carries the design's width and height (from `files`), so a high-density image is shown at
 * the design's size. Paths are relative to the repository root, each segment percent-encoded;
 * attribute values are HTML-escaped (`pictureHtml`).
 */
export function pictureSnippet(
  plan: readonly PlannedDesign[],
  files: readonly RenderedFile[] = [],
): string {
  return pictureHtml(
    plan.map((entry): PictureEntry => {
      const light = shown(entry.light);
      const size = files.find((file) => file.output === light)?.size;
      return {
        alt: entry.stem,
        light,
        ...(entry.dark === undefined ? {} : { dark: shown(entry.dark) }),
        ...(size === undefined ? {} : { size }),
      };
    }),
  );
}

function shown(file: PlannedFile): string {
  return file.outputs[0]?.output ?? "";
}
