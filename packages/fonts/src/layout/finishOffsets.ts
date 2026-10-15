import { AttachType, type GlyphBuffer } from "./GlyphBuffer.js";

/** Attachment chains followed per glyph (HarfBuzz HB_MAX_NESTING_LEVEL). */
const maxChain = 64;

/**
 * Resolves attachment chains into plain offsets (HarfBuzz position_finish_offsets): a mark ends up relative to its
 * own pen position, its base's offset and the advances between them included; a cursive glyph takes its parent's
 * vertical offset. Glyphs are in logical order; `rtl` says which way the pen moves. The advances between a mark and
 * its base come from prefix sums, so a mark far from its base costs no more than one next to it.
 */
export function finishOffsets(buffer: GlyphBuffer, rtl: boolean): void {
  const before = new Array<number>(buffer.length + 1);
  before[0] = 0;
  buffer.glyphs.forEach((info, index) => {
    before[index + 1] = (before[index] ?? 0) + info.xAdvance;
  });
  for (let index = 0; index < buffer.length; index++) {
    propagate(buffer, before, index, rtl, maxChain);
  }
}

/** Sum of the advances of glyphs [start, end). */
function advances(before: readonly number[], start: number, end: number): number {
  return (before[end] ?? 0) - (before[start] ?? 0);
}

function propagate(
  buffer: GlyphBuffer,
  before: readonly number[],
  index: number,
  rtl: boolean,
  level: number,
): void {
  const glyphs = buffer.glyphs;
  const info = glyphs[index];
  if (info === undefined || info.attachChain === 0 || level === 0) return;
  buffer.budget.charge();
  const chain = info.attachChain;
  info.attachChain = 0;
  const parentIndex = index + chain;
  const parent = glyphs[parentIndex];
  if (parent === undefined) return;
  propagate(buffer, before, parentIndex, rtl, level - 1);
  if (info.attachType === AttachType.cursive) {
    info.yOffset += parent.yOffset;
    return;
  }
  info.xOffset += parent.xOffset;
  info.yOffset += parent.yOffset;
  if (parentIndex >= index) return;
  if (!rtl) info.xOffset -= advances(before, parentIndex, index);
  else info.xOffset += advances(before, parentIndex + 1, index + 1);
}
