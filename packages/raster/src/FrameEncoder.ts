/** Encodes frames one at a time, so the output budget stops a too-large file at the frame that overflows it. */
export interface FrameEncoder {
  /** Straight RGBA pixels of the full canvas, shown for `delay` in the format's unit (ms, GIF centiseconds). */
  add(pixels: Uint8Array, delay: number): void;
  finish(): Uint8Array;
  /** Frames written: fewer than added when frames merged. */
  readonly frames: number;
}
