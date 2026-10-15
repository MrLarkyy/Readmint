import type { PlannedDesign } from "./PlannedDesign.js";
import type { PlannedFile } from "./PlannedFile.js";
import type { RenderedFile } from "./renderAll.js";

/**
 * The README HTML for the planned designs, in their order: a `<picture>` per design whose `<img>`
 * shows the light output and, when the design has a dark twin, a `<source>` that switches to the
 * dark output under `prefers-color-scheme: dark`. Each shows the first listed format; a raster
 * `<img>` carries the design's width and height (from `files`), so a high-density image is shown at
 * the design's size. Paths are relative to the repository root, each segment percent-encoded;
 * attribute values are HTML-escaped.
 */
export function pictureSnippet(
  plan: readonly PlannedDesign[],
  files: readonly RenderedFile[] = [],
): string {
  return plan
    .map((entry) => {
      const lines = ["<picture>"];
      if (entry.dark !== undefined) {
        lines.push(
          `  <source media="(prefers-color-scheme: dark)" srcset="${attribute(url(shown(entry.dark)))}">`,
        );
      }
      const src = shown(entry.light);
      const size = files.find((file) => file.output === src)?.size;
      const dimensions =
        size === undefined ? "" : ` width="${String(size.width)}" height="${String(size.height)}"`;
      lines.push(
        `  <img alt="${attribute(entry.stem)}" src="${attribute(url(src))}"${dimensions}>`,
      );
      lines.push("</picture>");
      return lines.join("\n");
    })
    .join("\n");
}

function shown(file: PlannedFile): string {
  return file.outputs[0]?.output ?? "";
}

function url(output: string): string {
  return output.split("/").map(encodeURIComponent).join("/");
}

function attribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
