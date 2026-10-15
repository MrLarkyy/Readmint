import type { EditorRasterFormat, RasterExportInput } from "./RasterExportInput.js";

/** Main thread to raster worker: export `input`, once. */
export interface RasterRequest {
  readonly input: RasterExportInput;
}

/** A finished export: the image file and its MIME type. */
export interface RasterFile {
  readonly format: EditorRasterFormat;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

/** Raster worker to main thread: the image, or the message of why there is none. */
export type RasterResponse = { readonly file: RasterFile } | { readonly error: string };
