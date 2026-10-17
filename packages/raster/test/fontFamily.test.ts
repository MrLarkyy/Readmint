import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { matchFontFamilies } from "../src/matchFontFamilies.js";
import { rasterFonts } from "../src/rasterFonts.js";
import { decodeApng } from "./decodeRaster.js";
import { dataUri, designInput, fontBytes, fontPath } from "./rasterFixtures.js";

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

const extraBoldBytes: Uint8Array = readFileSync(
  join(dirname(fontPath), "Montserrat-ExtraBold.ttf"),
);

/** The font with the 16-bit OS/2 field at `offset` set to `value`. */
function withOs2Field(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer);
  for (let table = 0; table < view.getUint16(4); table++) {
    const record = 12 + table * 16;
    if (String.fromCharCode(...copy.subarray(record, record + 4)) === "OS/2") {
      view.setUint16(view.getUint32(record + 8) + offset, value);
      return copy;
    }
  }
  throw new Error("the font has no OS/2 table");
}

/** The font with its OS/2 usWidthClass set to `width` (1..9): one more face of the family at another width. */
function atWidth(bytes: Uint8Array, width: number): Uint8Array {
  return withOs2Field(bytes, 6, width);
}

/** The font with its OS/2 usWeightClass set to `weight`: a face told apart by the weight inside it. */
function atWeight(bytes: Uint8Array, weight: number): Uint8Array {
  return withOs2Field(bytes, 4, weight);
}

interface Face {
  readonly family: string;
  readonly bytes: Uint8Array;
  readonly weight: number;
}

function facesSvg(faces: readonly Face[], text: string): string {
  const rules = faces
    .map(
      (face) =>
        `@font-face{font-family:"${face.family}";src:url(${dataUri("font/ttf", face.bytes)});font-weight:${String(face.weight)};font-style:normal}`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="28"><rect width="120" height="28" fill="#ffffff"/><defs><style>${rules}</style></defs>${text}</svg>`;
}

async function svgPixels(svg: string): Promise<Buffer> {
  const output = await exportRaster({ frame: () => svg }, { format: "png", scale: 1 });
  return Buffer.from(decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array());
}

const word = (attributes: string, content = "Readmint"): string =>
  `<text x="4" y="20" font-size="16" ${attributes}>${content}</text>`;

describe("faces of one family", () => {
  // Both Montserrat inside: resvg takes the width nearest to normal before the weight, and the weight inside the font.
  const medium = { family: "Brand", bytes: atWidth(fontBytes, 4), weight: 400 };
  const extraBold = { family: "Brand", bytes: atWidth(extraBoldBytes, 2), weight: 700 };
  const alone = (face: Face, weight: number) =>
    svgPixels(facesSvg([face], word(`font-family="'Brand'" font-weight="${String(weight)}"`)));

  test("each face of two widths draws the text that asks for its weight", async () => {
    const both = [medium, extraBold];
    const bold = await svgPixels(facesSvg(both, word(`font-family="'Brand'" font-weight="700"`)));
    const regular = await svgPixels(
      facesSvg(both, word(`font-family="'Brand'" font-weight="400"`)),
    );
    expect(bold.equals(await alone(extraBold, 700))).toBe(true);
    expect(regular.equals(await alone(medium, 400))).toBe(true);
    expect(bold.equals(regular)).toBe(false);
  });

  test("the rule's weight decides, not the weight inside the font", async () => {
    // Medium (500 inside) is the 700 rule, ExtraBold (800 inside) the 900 rule: a 700 text draws Medium.
    const faces = [
      { family: "Brand", bytes: fontBytes, weight: 700 },
      { family: "Brand", bytes: extraBoldBytes, weight: 900 },
    ];
    const asked = await svgPixels(facesSvg(faces, word(`font-family="'Brand'" font-weight="700"`)));
    expect(asked.equals(await alone({ ...medium, bytes: fontBytes }, 700))).toBe(true);
  });

  test("a tspan naming a fallback family draws its own face, and one without inherits the text's", async () => {
    const faces = [medium, { family: "Fallback", bytes: atWidth(extraBoldBytes, 2), weight: 700 }];
    const mixed = await svgPixels(
      facesSvg(
        faces,
        word(
          `font-family="'Brand'" font-weight="400"`,
          `<tspan font-family="'Fallback'" font-weight="700">Read</tspan><tspan>mint</tspan>`,
        ),
      ),
    );
    const reference = await svgPixels(
      facesSvg(
        faces,
        word(
          `font-family="'Fallback'" font-weight="700"`,
          `Read<tspan font-family="'Brand'" font-weight="400">mint</tspan>`,
        ),
      ),
    );
    expect(mixed.equals(reference)).toBe(true);
    expect(mixed.equals(await alone(medium, 400))).toBe(false);
  });

  test("the rasterizer's copy names each face by what is inside it", () => {
    const svg = facesSvg(
      [medium, extraBold],
      word(
        `font-family="'Brand'" font-weight="700"`,
        `<tspan font-weight="400">a</tspan><tspan>b</tspan><tspan font-family="'Montserrat'" font-weight="500">c</tspan>`,
      ),
    );
    const tags = matchFontFamilies(svg, rasterFonts(svg)).match(/<t(?:ext|span)\b[^>]*>/g);
    expect(tags).toEqual([
      `<text x="4" y="20" font-size="16" font-family="&#39;Montserrat&#39;" font-weight="800" font-stretch="extra-condensed" font-style="normal">`,
      `<tspan font-weight="500" font-family="&#39;Montserrat&#39;" font-stretch="semi-condensed" font-style="normal">`,
      "<tspan>",
      `<tspan font-family="&#39;Montserrat&#39;" font-weight="500" font-stretch="normal" font-style="normal">`,
    ]);
  });

  test("a weight or style no rule has takes the face CSS falls back to", () => {
    // The weight inside each face (310, 510, 610, 710) tells the picked rule apart in the rewritten tag.
    const face = (weight: number, bytes: Uint8Array) => ({
      family: "Brand",
      bytes: atWeight(bytes, weight + 10),
      weight,
    });
    const picked = (faces: readonly Face[], weight: number, style = "normal"): string => {
      const svg = facesSvg(
        faces,
        word(`font-family="'Brand'" font-weight="${String(weight)}" font-style="${style}"`),
      );
      const tag = /<text\s[^>]*>/.exec(matchFontFamilies(svg, rasterFonts(svg)))?.[0] ?? "";
      return `${/font-weight="(\d+)"/.exec(tag)?.[1] ?? ""} ${/font-style="(\w+)"/.exec(tag)?.[1] ?? ""}`;
    };
    const three = [face(300, fontBytes), face(500, fontBytes), face(700, extraBoldBytes)];
    expect(picked(three, 350)).toBe("310 normal");
    expect(picked(three, 450)).toBe("510 normal");
    expect(picked(three, 600)).toBe("710 normal");
    expect(picked([face(300, fontBytes), face(600, extraBoldBytes)], 450)).toBe("310 normal");
    expect(picked(three, 500, "italic")).toBe("510 normal");
  });

  test("a tspan whose family no font carries is a raster-font error", async () => {
    const svg = facesSvg(
      [medium],
      word(`font-family="'Brand'"`, `<tspan font-family="'Nope'">x</tspan>`),
    );
    await expect(exportRaster({ frame: () => svg }, { format: "png" })).rejects.toThrow(
      'the font family "Nope"',
    );
  });
});
