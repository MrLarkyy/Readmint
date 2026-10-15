import { buildTestFont, type TestPoint } from "./buildTestFont.js";

const on = (x: number, y: number): TestPoint => [x, y, true];
const off = (x: number, y: number): TestPoint => [x, y, false];

/** U+2605 BLACK STAR, U+25CF BLACK CIRCLE (quadratic) and U+1F536 LARGE ORANGE DIAMOND (above the BMP). */
export const testSymbols = { star: 0x2605, circle: 0x25cf, diamond: 0x1f536 } as const;

/**
 * "Readmint Test Symbols": the repository's own font (same licence as the repository), committed as
 * packages/renderer/test/fonts/ReadmintTestSymbols.ttf. It covers what Montserrat lacks, so a fallback has
 * something to draw, and one code point above the BMP.
 */
export function readmintTestSymbols(): Uint8Array {
  return buildTestFont({
    family: "Readmint Test Symbols",
    weight: 400,
    glyphs: [
      {
        advance: 500,
        contours: [
          [on(50, 0), on(50, 700), on(450, 700), on(450, 0)],
          [on(100, 50), on(400, 50), on(400, 650), on(100, 650)],
        ],
      },
      { codePoints: [0x20], advance: 250 },
      {
        codePoints: [testSymbols.star],
        advance: 780,
        contours: [
          [
            on(390, 710),
            on(478, 451),
            on(751, 447),
            on(533, 284),
            on(613, 23),
            on(390, 180),
            on(167, 23),
            on(247, 284),
            on(29, 447),
            on(302, 451),
          ],
        ],
      },
      {
        codePoints: [testSymbols.circle],
        advance: 600,
        contours: [
          [
            on(300, 550),
            off(550, 550),
            on(550, 300),
            off(550, 50),
            on(300, 50),
            off(50, 50),
            on(50, 300),
            off(50, 550),
          ],
        ],
      },
      {
        codePoints: [testSymbols.diamond],
        advance: 600,
        contours: [[on(300, 600), on(560, 300), on(300, 0), on(40, 300)]],
      },
    ],
  });
}
