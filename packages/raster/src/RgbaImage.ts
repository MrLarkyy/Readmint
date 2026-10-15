/** Straight (not premultiplied) RGBA pixels, row by row. */
export interface RgbaImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}
