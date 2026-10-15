import type { Design } from "@readmint/format";
import type { RenderAssets } from "@readmint/renderer";

/** The raster formats the editor exports; the CLI's defaults apply to everything else (scale 2, lossless WebP). */
export type EditorRasterFormat = "png" | "webp";

/** What a raster export reads of the editor state, plus the format. */
export interface RasterExportInput {
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly sessionAssets: RenderAssets;
  readonly format: EditorRasterFormat;
}
