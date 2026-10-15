import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { decodeApng } from "./decodeRaster.js";
import { dataUri, designInput, fontBytes } from "./rasterFixtures.js";

function textDesign(family: string): Design {
  return {
    version: 0,
    canvas: { width: 96, height: 28, background: "#ffffff" },
    assets: {
      fonts: {
        body: {
          family,
          src: dataUri("font/ttf", fontBytes),
          weight: 500,
          licence: { embedding: "allowed", name: "OFL-1.1" },
        },
      },
    },
    layers: [{ type: "text", x: 4, y: 6, content: "Readmint", font: "body", fontSize: 16 }],
  };
}

async function pixels(design: Design): Promise<Uint8Array> {
  const output = await exportRaster(designInput(design), { format: "png", scale: 1 });
  return decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
}

describe("font families", () => {
  test("a font whose asset family differs from the name inside it still draws the text", async () => {
    const rendered = renderSvg(textDesign("Brand Sans"));
    expect(rendered.ok && rendered.warnings.map((issue) => issue.code)).toContain(
      "font-family-mismatch",
    );
    const mismatched = await pixels(textDesign("Brand Sans"));
    expect(Buffer.from(mismatched).equals(await pixels(textDesign("Montserrat")))).toBe(true);
    let dark = 0;
    for (let index = 0; index < mismatched.length; index += 4) {
      if ((mismatched[index] ?? 255) < 128) dark++;
    }
    expect(dark).toBeGreaterThan(50);
  });

  test("a family with quotes and parentheses in it resolves too", async () => {
    const odd = await pixels(textDesign(`O'Brien "Sans" (beta)`));
    expect(Buffer.from(odd).equals(await pixels(textDesign("Montserrat")))).toBe(true);
  });

  test("a text whose family no font carries is a raster-font error naming it", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><defs><style>@font-face{font-family:"Montserrat";src:url(${dataUri("font/ttf", fontBytes)});font-weight:500;font-style:normal}</style></defs><text x="4" y="18" font-family="'Nope'" font-size="16">Readmint</text></svg>`;
    const failure = exportRaster({ frame: () => svg }, { format: "png" });
    await expect(failure).rejects.toMatchObject({ code: "raster-font" });
    await expect(failure).rejects.toThrow(
      'the font family "Nope", which no embedded or given font',
    );
  });
});
