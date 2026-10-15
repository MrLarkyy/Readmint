/** Straight (not premultiplied) RGBA pixels, row by row. */
export interface RgbaImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** The WebP codecs, loaded once by `initRaster`. */
export interface RasterCodecs {
  /** A lossless WebP file (`RIFF` + `VP8L`) of the pixels, exactly as given. */
  encodeWebp(image: RgbaImage): Uint8Array;
  /** The pixels of a still WebP file; `undefined` when libwebp cannot decode it. */
  decodeWebp(bytes: Uint8Array): RgbaImage | undefined;
}
