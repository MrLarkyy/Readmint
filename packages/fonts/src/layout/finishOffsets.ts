import { AttachType, type GlyphBuffer } from "./GlyphBuffer.js";

/** Attachment chains followed per glyph (HarfBuzz HB_MAX_NESTING_LEVEL). */
const maxChain = 64;

/**
 * Resolves attachment chains into plain offsets (HarfBuzz position_finish_offsets): a mark ends up relative to its
 * own pen position, its base's offset and the advances between them included; a cursive glyph takes its parent's
 * vertical offset. Glyphs are in logical order; `rtl` says which way the pen moves.
 */
export function finishOffsets(buffer: GlyphBuffer, rtl: boolean): void {
  for (let index = 0; index < buffer.length; index++) propagate(buffer, index, rtl, maxChain);
}

function propagate(buffer: GlyphBuffer, index: number, rtl: boolean, level: number): void {
  const glyphs = buffer.glyphs;
  const info = glyphs[index];
  if (info === undefined || info.attachChain === 0 || level === 0) return;
  const chain = info.attachChain;
  info.attachChain = 0;
  const parentIndex = index + chain;
  const parent = glyphs[parentIndex];
  if (parent === undefined) return;
  propagate(buffer, parentIndex, rtl, level - 1);
  if (info.attachType === AttachType.cursive) {
    info.yOffset += parent.yOffset;
    return;
  }
  info.xOffset += parent.xOffset;
  info.yOffset += parent.yOffset;
  if (parentIndex >= index) return;
  buffer.budget.charge(1 + ((index - parentIndex) >>> 4));
  if (!rtl) {
    for (let between = parentIndex; between < index; between++) {
      info.xOffset -= glyphs[between]?.xAdvance ?? 0;
    }
  } else {
    for (let between = parentIndex + 1; between <= index; between++) {
      info.xOffset += glyphs[between]?.xAdvance ?? 0;
    }
  }
}
