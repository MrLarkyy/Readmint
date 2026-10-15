import { encodeWoff } from "@readmint/fonts";
import { describe, expect, test } from "vitest";
import { exportRaster, RasterError } from "../src/index.js";
import { woffFont } from "../src/woffFont.js";
import { decodeApng } from "./decodeRaster.js";
import { dataUri, fontBytes } from "./rasterFixtures.js";

const woff = encodeWoff(fontBytes);

function textSvg(mime: string, font: Uint8Array): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="28"><defs><style>@font-face{font-family:"Montserrat";src:url(${dataUri(mime, font)});font-weight:500;font-style:normal}</style></defs><rect width="96" height="28" fill="#ffffff"/><text x="4" y="20" font-family="'Montserrat'" font-size="16" font-weight="500">Readmint</text></svg>`;
}

async function pixels(svg: string): Promise<Uint8Array> {
  const output = await exportRaster({ frame: () => svg }, { format: "png", scale: 1 });
  return decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
}

function readable(bytes: Uint8Array): Uint8Array {
  return woffFont(bytes, 4_194_304, "the font");
}

describe("WOFF fonts", () => {
  test("decode to the TrueType font they hold, table for table", () => {
    const sfnt = readable(woff);
    expect(sfnt.length).toBeGreaterThanOrEqual(fontBytes.length - 3);
    const view = new DataView(sfnt.buffer);
    expect(view.getUint32(0)).toBe(0x00010000);
    expect(view.getUint16(4)).toBe(
      new DataView(fontBytes.buffer, fontBytes.byteOffset).getUint16(4),
    );
  });

  test("a font the SVG embeds as WOFF draws exactly like the same font as TTF", async () => {
    const asWoff = await pixels(textSvg("font/woff", woff));
    expect(Buffer.from(asWoff).equals(await pixels(textSvg("font/ttf", fontBytes)))).toBe(true);
    let dark = 0;
    for (let index = 0; index < asWoff.length; index += 4) if ((asWoff[index] ?? 255) < 128) dark++;
    expect(dark).toBeGreaterThan(50);
  });

  test("WOFF2 stays a raster-font error naming what to do", async () => {
    const failure = exportRaster(
      { frame: () => textSvg("font/woff2", Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0, 0])) },
      { format: "png" },
    );
    await expect(failure).rejects.toMatchObject({ code: "raster-font" });
    await expect(failure).rejects.toThrow("WOFF2, which raster export cannot draw yet");
  });

  const broken: [string, (bytes: Uint8Array) => void, string | RegExp][] = [
    ["a header without a font flavour", (b) => b.fill(0, 4, 8), "wraps no TrueType or CFF font"],
    [
      "a directory past the end",
      (b) => {
        new DataView(b.buffer).setUint16(12, 60_000);
      },
      "tables (1 to 64 allowed)",
    ],
    [
      "a table past the end",
      (b) => {
        new DataView(b.buffer).setUint32(44 + 4, b.length);
      },
      "lies past the end",
    ],
    [
      "a table stored larger than it is",
      (b) => {
        new DataView(b.buffer).setUint32(44 + 12, 1);
      },
      "larger compressed than inflated",
    ],
    [
      "a table that inflates past its declared size",
      (b) => {
        const view = new DataView(b.buffer);
        for (let index = 0; index < view.getUint16(12); index++) {
          const entry = 44 + index * 20;
          if (view.getUint32(entry + 8) < view.getUint32(entry + 12)) {
            view.setUint32(entry + 12, view.getUint32(entry + 8) + 1);
            return;
          }
        }
      },
      "inflates to more bytes than it declares",
    ],
    [
      "a corrupt compressed table",
      (b) => {
        const view = new DataView(b.buffer);
        for (let index = 0; index < view.getUint16(12); index++) {
          const entry = 44 + index * 20;
          if (view.getUint32(entry + 8) < view.getUint32(entry + 12)) {
            b.fill(0xff, view.getUint32(entry + 4) + 2, view.getUint32(entry + 4) + 12);
            return;
          }
        }
      },
      /inflates to (?:fewer|more) bytes than it declares|not valid zlib data/,
    ],
  ];

  test.each(broken)("%s is a raster-font error", (_name, damage, reason) => {
    const bytes = woff.slice();
    damage(bytes);
    expect(() => readable(bytes)).toThrow(RasterError);
    expect(() => readable(bytes)).toThrow(reason);
  });

  test("tables that decode past the font limit are refused before anything inflates", () => {
    expect(() => woffFont(woff, 1000, "the font")).toThrow(
      /decompresses to \d+ bytes, more than the 1000 allowed/,
    );
  });
});
