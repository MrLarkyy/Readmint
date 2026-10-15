import { describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { decodeApng } from "./decodeRaster.js";
import { dataUri, designInput, fontBytes, textDesign } from "./rasterFixtures.js";

function textSvg(style = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><style>${style}</style><text x="4" y="18" font-family="Montserrat" font-size="16">Readmint</text></svg>`;
}

/** Pixels that are not fully transparent. */
function inked(bytes: Uint8Array): number {
  const pixels = decodeApng(bytes).frames[0]?.pixels ?? new Uint8Array();
  let count = 0;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) count++;
  return count;
}

describe("raster fonts", () => {
  test("text with no font at all is a raster-font error, never blank text", async () => {
    const failure = exportRaster({ frame: () => textSvg() }, { format: "png" });
    await expect(failure).rejects.toMatchObject({ code: "raster-font" });
    await expect(failure).rejects.toThrow("has no font to draw it with");
  });

  test("a WOFF2 font is a raster-font error naming the format", async () => {
    const style = `@font-face{font-family:"Montserrat";src:url(${dataUri("font/woff2", new Uint8Array([0x77, 0x4f, 0x46, 0x32]))})}`;
    const failure = exportRaster({ frame: () => textSvg(style) }, { format: "png" });
    await expect(failure).rejects.toMatchObject({ code: "raster-font" });
    await expect(failure).rejects.toThrow("font/woff2");
  });

  test("a caller font that is not TTF or OTF is a raster-font error", async () => {
    await expect(
      exportRaster(
        { frame: () => textSvg(), fonts: [new Uint8Array([1, 2, 3, 4])] },
        { format: "png" },
      ),
    ).rejects.toMatchObject({
      code: "raster-font",
      message: "font 1 is not a TTF, OTF or WOFF font",
    });
  });

  test("the TTF the SVG embeds draws the text", async () => {
    const output = await exportRaster(designInput(textDesign), { format: "png", scale: 1 });
    const pixels = decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) if ((pixels[index] ?? 255) < 128) dark++;
    expect(dark).toBeGreaterThan(50);
  });

  test("a caller TTF draws text the SVG embeds no font for", async () => {
    const output = await exportRaster(
      { frame: () => textSvg(), fonts: [fontBytes] },
      { format: "png", scale: 1 },
    );
    expect(inked(output.bytes)).toBeGreaterThan(50);
  });
});
