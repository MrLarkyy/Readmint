import type { RgbaImage } from "./RgbaImage.js";

/** libwebp, one instance per export (`openWebpCodec`): its memory goes when the export is done. */
export interface WebpCodec {
  /** A lossless WebP file (`RIFF` + `VP8L`) of the pixels. */
  encodeWebp(image: RgbaImage): Uint8Array;
  /** The pixels of a still WebP file; `undefined` when libwebp cannot decode it. */
  decodeWebp(bytes: Uint8Array): RgbaImage | undefined;
}
