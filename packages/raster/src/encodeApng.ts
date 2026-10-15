import { changedRect } from "./changedRect.js";
import type { FrameEncoder } from "./FrameEncoder.js";
import type { OutputBudget } from "./OutputBudget.js";
import type { PixelRect } from "./PixelRect.js";
import { compressRgba, ihdr, PngWriter } from "./PngWriter.js";

/**
 * An animated PNG, delays in milliseconds. The first frame is the default image (what a viewer without APNG shows);
 * each later frame holds only the rectangle that changed, drawn over the previous frame (dispose none, blend
 * source), so the canvas always equals the full frame.
 */
export function encodeApng(
  width: number,
  height: number,
  loop: boolean,
  budget: OutputBudget,
): FrameEncoder {
  const writer = new PngWriter(budget);
  writer.chunk("IHDR", ihdr(width, height));
  const controlAt = writer.position;
  let previous: Uint8Array | undefined;
  let sequence = 0;
  let frames = 0;
  return {
    get frames() {
      return frames;
    },
    add(pixels, delay) {
      const rect: PixelRect =
        previous === undefined
          ? { x: 0, y: 0, width, height }
          : (changedRect(previous, pixels, width, height) ?? { x: 0, y: 0, width: 1, height: 1 });
      writer.chunk("fcTL", frameControl(sequence++, rect, delay));
      const data = compressRgba(pixels, width, rect);
      if (previous === undefined) {
        writer.chunk("IDAT", data);
      } else {
        const chunk = new Uint8Array(4 + data.length);
        new DataView(chunk.buffer).setUint32(0, sequence++);
        chunk.set(data, 4);
        writer.chunk("fdAT", chunk);
      }
      previous = pixels;
      frames++;
    },
    finish() {
      const control = new Uint8Array(8);
      const view = new DataView(control.buffer);
      view.setUint32(0, frames);
      view.setUint32(4, loop ? 0 : 1);
      writer.insertChunk(controlAt, "acTL", control);
      writer.chunk("IEND", new Uint8Array(0));
      return writer.bytes();
    },
  };
}

function frameControl(sequence: number, rect: PixelRect, delay: number): Uint8Array {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, rect.width);
  view.setUint32(8, rect.height);
  view.setUint32(12, rect.x);
  view.setUint32(16, rect.y);
  // delay_num / delay_den seconds; past 65.535 s only centiseconds fit.
  const [numerator, denominator] = delay <= 0xffff ? [delay, 1000] : [Math.round(delay / 10), 100];
  view.setUint16(20, numerator);
  view.setUint16(22, denominator);
  data[24] = 0;
  data[25] = 0;
  return data;
}
