/** One image of the README snippet: its alt text, the light output and, when there is one, the dark output. */
export interface PictureEntry {
  readonly alt: string;
  /** Output path as written into the snippet, `/`-separated; each segment is percent-encoded here. */
  readonly light: string;
  readonly dark?: string;
  /** The design's size in CSS pixels; a raster `<img>` carries it, so a high-density image shows at that size. */
  readonly size?: { readonly width: number; readonly height: number };
}

/**
 * The README HTML for the entries, in their order: a `<picture>` each whose `<img>` shows the light output and, when
 * there is a dark one, a `<source>` that switches to it under `prefers-color-scheme: dark`. Each path segment is
 * percent-encoded and attribute values are HTML-escaped.
 */
export function pictureHtml(entries: readonly PictureEntry[]): string {
  return entries
    .map((entry) => {
      const lines = ["<picture>"];
      if (entry.dark !== undefined) {
        lines.push(
          `  <source media="(prefers-color-scheme: dark)" srcset="${attribute(url(entry.dark))}">`,
        );
      }
      const dimensions =
        entry.size === undefined
          ? ""
          : ` width="${String(entry.size.width)}" height="${String(entry.size.height)}"`;
      lines.push(
        `  <img alt="${attribute(entry.alt)}" src="${attribute(url(entry.light))}"${dimensions}>`,
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
