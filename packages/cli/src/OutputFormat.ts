import { type RasterFormat, rasterFormats } from "@readmint/raster";

/** What `readmint render` and the Action write: the SVG itself or a raster image of it. */
export type OutputFormat = "svg" | RasterFormat;

export const outputFormats: readonly OutputFormat[] = Object.freeze(["svg", ...rasterFormats]);

/** The file extension of a format, without the dot: an animated PNG is a `.png` file. */
export function outputExtension(format: OutputFormat): string {
  return format === "apng" ? "png" : format;
}
