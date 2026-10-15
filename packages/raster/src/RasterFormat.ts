/** A raster output format. `apng` is an animated PNG, written as a `.png` file. */
export type RasterFormat = "png" | "webp" | "apng" | "gif";

export const rasterFormats: readonly RasterFormat[] = Object.freeze(["png", "webp", "apng", "gif"]);
