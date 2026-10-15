// The declarations travel with this file into every program that compiles it (the CLI and Action typechecks too).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./gifenc.d.ts" />
import * as gifencModule from "gifenc";
import type { GifPalette } from "gifenc";
import type { FrameEncoder } from "./FrameEncoder.js";
import type { OutputBudget } from "./OutputBudget.js";
import { sameBytes } from "./sameBytes.js";

// Node gets the CommonJS build (every function on the default export), Vite and the Action bundle the ES build
// (named exports; its default is GIFEncoder alone).
const loaded: { readonly default?: unknown } = gifencModule;
const gifenc = ("GIFEncoder" in loaded ? loaded : loaded.default) as typeof gifencModule;
const { applyPalette, GIFEncoder, quantize } = gifenc;

/** Pixels below this alpha are transparent in a GIF; the rest are drawn opaque (GIF has 1-bit alpha). */
const alphaThreshold = 128;

interface IndexedFrame {
  readonly index: Uint8Array;
  readonly palette: GifPalette;
  readonly transparentIndex: number | undefined;
  delay: number;
}

/**
 * A GIF, delays in centiseconds: every frame full-size with its own palette of up to 256 colours (pnnquant over the
 * opaque pixels) plus one transparent index when the frame has transparent pixels. Frames that come out the same
 * after palettizing merge, delays summed. Animated frames dispose to the background, so a transparent pixel never
 * shows the frame before it.
 */
export function encodeGif(
  width: number,
  height: number,
  animation: { readonly loop: boolean } | undefined,
  budget: OutputBudget,
): FrameEncoder {
  const gif = GIFEncoder();
  let pending: IndexedFrame | undefined;
  let frames = 0;
  const write = (frame: IndexedFrame): void => {
    gif.writeFrame(frame.index, width, height, {
      palette: frame.palette,
      delay: frame.delay * 10,
      repeat: animation?.loop === true ? 0 : -1,
      transparent: frame.transparentIndex !== undefined,
      transparentIndex: frame.transparentIndex ?? 0,
      ...(animation === undefined ? {} : { dispose: 2 }),
    });
    budget.set(gif.bytesView().length);
    frames++;
  };
  return {
    get frames() {
      return frames;
    },
    add(pixels, delay) {
      const frame = { ...palettize(pixels), delay };
      if (pending !== undefined && sameFrame(pending, frame)) {
        pending.delay += delay;
        return;
      }
      if (pending !== undefined) write(pending);
      pending = frame;
    },
    finish() {
      if (pending !== undefined) write(pending);
      gif.finish();
      budget.set(gif.bytesView().length);
      return gif.bytes();
    },
  };
}

function palettize(pixels: Uint8Array): Omit<IndexedFrame, "delay"> {
  const count = pixels.length / 4;
  let opaque = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    if ((pixels[pixel * 4 + 3] ?? 0) >= alphaThreshold) opaque++;
  }
  const colours = new Uint8Array(opaque * 4);
  const solid = new Uint8Array(pixels.length);
  for (let pixel = 0, next = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    solid[at] = pixels[at] ?? 0;
    solid[at + 1] = pixels[at + 1] ?? 0;
    solid[at + 2] = pixels[at + 2] ?? 0;
    solid[at + 3] = 255;
    if ((pixels[at + 3] ?? 0) < alphaThreshold) continue;
    colours.set(solid.subarray(at, at + 4), next);
    next += 4;
  }
  const transparent = opaque < count;
  const palette = opaque === 0 ? [] : quantize(colours, transparent ? 255 : 256);
  const index = palette.length === 0 ? new Uint8Array(count) : applyPalette(solid, palette);
  if (!transparent) return { index, palette, transparentIndex: undefined };
  const transparentIndex = palette.length;
  for (let pixel = 0; pixel < count; pixel++) {
    if ((pixels[pixel * 4 + 3] ?? 0) < alphaThreshold) index[pixel] = transparentIndex;
  }
  return { index, palette: [...palette, [0, 0, 0]], transparentIndex };
}

function sameFrame(a: Omit<IndexedFrame, "delay">, b: Omit<IndexedFrame, "delay">): boolean {
  if (a.transparentIndex !== b.transparentIndex || a.palette.length !== b.palette.length) {
    return false;
  }
  const samePalette = a.palette.every((colour, index) => {
    const other = b.palette[index];
    return other !== undefined && colour.every((channel, at) => channel === other[at]);
  });
  return samePalette && sameBytes(a.index, b.index);
}
