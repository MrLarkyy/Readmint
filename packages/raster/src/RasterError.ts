export type RasterErrorCode =
  | "raster-too-large"
  | "raster-too-many-frames"
  | "raster-too-long"
  | "raster-too-many-pixels"
  | "raster-output-too-large"
  | "raster-too-many-image-pixels"
  | "raster-font"
  | "raster-image"
  | "raster-options";

/**
 * A raster export that cannot be made. The message names the measured value, the limit and a fix in words that fit
 * both the CLI and the Action; it never holds SVG text, image bytes or data values (a font family is quoted, cut
 * to 64 characters). Nothing is returned, so a caller has nothing partial to write.
 */
export class RasterError extends Error {
  override readonly name = "RasterError";
  readonly code: RasterErrorCode;

  constructor(code: RasterErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
