import type { PlannedDesign } from "./PlannedDesign.js";

/**
 * The README HTML for the planned designs, in their order: a `<picture>` per design whose `<img>`
 * shows the light output and, when the design has a dark twin, a `<source>` that switches to the
 * dark output under `prefers-color-scheme: dark`. Paths are relative to the repository root, each
 * segment percent-encoded; attribute values are HTML-escaped.
 */
export function pictureSnippet(plan: readonly PlannedDesign[]): string {
  return plan
    .map((entry) => {
      const lines = ["<picture>"];
      if (entry.dark !== undefined) {
        lines.push(
          `  <source media="(prefers-color-scheme: dark)" srcset="${attribute(url(entry.dark.output))}">`,
        );
      }
      lines.push(
        `  <img alt="${attribute(entry.stem)}" src="${attribute(url(entry.light.output))}">`,
      );
      lines.push("</picture>");
      return lines.join("\n");
    })
    .join("\n");
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
