import type { RgbaImage } from "./RgbaImage.js";

/** libwebp, one instance per export (`openWebpCodec`): its memory goes when the export is done. */
export interface WebpCodec {
  /**
   * A WebP file of the pixels: lossless (`RIFF` + `VP8L`) without `quality`, else lossy (`VP8 `, plus `ALPH` with
   * transparency) at that libwebp quality, 1..100.
   */
  encodeWebp(image: RgbaImage, quality?: number): Uint8Array;
  /** The pixels of a still WebP file; `undefined` when libwebp cannot decode it. */
  decodeWebp(bytes: Uint8Array): RgbaImage | undefined;
}
