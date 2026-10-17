import type { PNG } from "pngjs";

export const inkTile = 16;

export interface TileInk {
  x: number;
  y: number;
  shift: number;
}

// Anti-aliasing moves coverage between neighbouring pixels but keeps the summed luma of a tile it
// stays inside, so the signed sum per tile sees a lost faint mark that a per-pixel colour threshold cannot.
// Both flattenings are summed because an alpha-only change shows on one of them: a dark mark on
// the white one, a light mark on the black one.
export function tileInkShift(expected: PNG, actual: PNG, tile = inkTile): TileInk {
  const { width, height } = expected;
  const tilesX = Math.ceil(width / tile);
  const tilesY = Math.ceil(height / tile);
  const onWhite = new Float64Array(tilesX * tilesY);
  const onBlack = new Float64Array(tilesX * tilesY);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const cell = Math.floor(y / tile) * tilesX + Math.floor(x / tile);
      const alphaE = (expected.data[i + 3] ?? 0) / 255;
      const alphaA = (actual.data[i + 3] ?? 0) / 255;
      const lumaE = luma(expected.data, i);
      const lumaA = luma(actual.data, i);
      onBlack[cell] = (onBlack[cell] ?? 0) + lumaA * alphaA - lumaE * alphaE;
      onWhite[cell] =
        (onWhite[cell] ?? 0) +
        (lumaA * alphaA + 255 * (1 - alphaA)) -
        (lumaE * alphaE + 255 * (1 - alphaE));
    }
  }
  let worst: TileInk = { x: 0, y: 0, shift: 0 };
  for (let ty = 0; ty < tilesY; ty++) {
    const rows = Math.min(tile, height - ty * tile);
    for (let tx = 0; tx < tilesX; tx++) {
      const cols = Math.min(tile, width - tx * tile);
      const cell = ty * tilesX + tx;
      const sum = Math.max(Math.abs(onWhite[cell] ?? 0), Math.abs(onBlack[cell] ?? 0));
      const shift = sum / (rows * cols * 255);
      if (shift > worst.shift) worst = { x: tx * tile, y: ty * tile, shift };
    }
  }
  return worst;
}

function luma(data: Uint8Array, i: number): number {
  return 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
}
