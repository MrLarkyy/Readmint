// gifenc 1.0.3 ships no types; these cover the part raster export uses. Node loads its CommonJS build (the functions
// on the default export only), Vite and bundlers its ES build (named exports).
declare module "gifenc" {
  export type GifPalette = number[][];
  export type GifColorFormat = "rgb565" | "rgb444" | "rgba4444";

  export interface GifFrameOptions {
    palette?: GifPalette;
    /** Milliseconds, written rounded to centiseconds. */
    delay?: number;
    /** -1: no NETSCAPE block (play once), 0: forever. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
  }

  export interface GifEncoderStream {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  export function GIFEncoder(options?: {
    initialCapacity?: number;
    auto?: boolean;
  }): GifEncoderStream;
  export function quantize(
    rgba: Uint8Array,
    maxColors: number,
    options?: { format?: GifColorFormat; oneBitAlpha?: boolean | number },
  ): GifPalette;
  export function applyPalette(
    rgba: Uint8Array,
    palette: GifPalette,
    format?: GifColorFormat,
  ): Uint8Array;

  /** The CommonJS build: an object of the functions; the ES build: `GIFEncoder` alone. */
  const gifenc: unknown;
  export default gifenc;
}
