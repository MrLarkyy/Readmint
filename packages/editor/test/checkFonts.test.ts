import { encodeWoff } from "@readmint/fonts";
import { DesignLimits, type Design, type FontAsset } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { readmintTestSymbols } from "../../fonts/test/readmintTestSymbols.js";
import { readTableDirectory } from "../../fonts/src/readTableDirectory.js";
import { SfntReader } from "../../fonts/src/SfntReader.js";
import { TRUETYPE_FLAVOR } from "../../fonts/src/sfntFlavor.js";
import { writeSfnt } from "../../fonts/src/writeSfnt.js";
import { decodeDataUri, encodeBase64 } from "../src/base64.js";
import {
  checkFonts,
  createEditorState,
  EditorLimits,
  exportDesign,
  importDesign,
  newDesign,
} from "../src/index.js";
import { testFonts } from "./testFonts.js";

const licence = { embedding: "allowed" } as const;

/**
 * Review probes: the test symbols font plus a 3.9 MB table of zeros, a 4.8 kB WOFF; `drop` leaves out a table the
 * parser needs (it then fails only after inflating everything). The WOFF header's version fields (bytes 24 to 27)
 * carry `variant`: they change nothing the parser reads, so each variant is a source of its own at no cost here.
 */
function woffBombs(variants: number, drop?: string): string[] {
  const reader = new SfntReader(readmintTestSymbols());
  const tables = new Map<string, Uint8Array>();
  for (const [tag, table] of readTableDirectory(reader)) {
    if (tag !== drop) tables.set(tag, reader.slice(table.offset, table.length));
  }
  tables.set("zzzz", new Uint8Array(3_900_000));
  const woff = encodeWoff(writeSfnt(TRUETYPE_FLAVOR, tables, false));
  return Array.from({ length: variants }, (_, variant) => {
    const copy = woff.slice();
    new DataView(copy.buffer).setUint32(24, variant);
    return `data:font/woff;base64,${encodeBase64(copy)}`;
  });
}

/** As many fonts as fit in a design file, cycling through `variants` bomb sources. */
async function bombDesign(variants: number, drop?: string): Promise<Design> {
  const sources = woffBombs(variants, drop);
  const each = (sources[0]?.length ?? 0) + 120;
  const count = Math.floor((DesignLimits.maxSourceLength - 100_000) / each);
  const fonts: Record<string, FontAsset> = {};
  for (let index = 0; index < count; index++) {
    fonts[`f${String(index)}`] = {
      family: "Readmint Test Symbols",
      src: sources[index % variants] ?? "",
      licence,
    };
  }
  const imported = await importDesign(exportDesign({ ...newDesign(), assets: { fonts } }));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  expect(Object.keys(imported.value.assets?.fonts ?? {}).length).toBeGreaterThan(600);
  return imported.value;
}

describe("checkFonts bounds the work of a design's fonts as the renderer does", () => {
  test("its total allowance is the renderer's", () => {
    expect(EditorLimits.maxTotalFontBytes).toBe(RenderLimits.maxTotalFontBytes);
  });

  test("hundreds of copies of one font bomb decode once", async () => {
    const design = await bombDesign(1);
    const started = performance.now();
    const checked = checkFonts(createEditorState(design));
    const elapsed = performance.now() - started;
    expect(checked.issues).toEqual([]);
    expect(Object.keys(checked.fontChecks)).toHaveLength(
      Object.keys(design.assets?.fonts ?? {}).length,
    );
    // Before: every copy decoded (624 copies: 10.9 s, 2.4 GB); now one. The ceiling only catches a late stop.
    expect(elapsed).toBeLessThan(2_000 * loadScale());
  });

  test("distinct bombs stop at the font that crosses the total, before it inflates", async () => {
    const design = await bombDesign(8);
    const started = performance.now();
    const checked = checkFonts(createEditorState(design));
    const elapsed = performance.now() - started;
    // 3.9 MB each: four fit in 16 MiB, the fifth source (f4) crosses before it inflates.
    expect(checked.issues).toEqual([
      {
        source: "font",
        path: "/assets/fonts/f4",
        message: expect.stringContaining("maxTotalFontBytes") as string,
      },
    ]);
    expect(Object.keys(checked.fontChecks)).toEqual(["f0", "f1", "f2", "f3"]);
    expect(elapsed).toBeLessThan(2_000 * loadScale());
  });

  test("distinct malformed bombs stop at the first one, after inflating only it", async () => {
    // Without `head` each bomb inflates its 3.9 MB and only then fails (before: 624 of them, 11.3 s, no issue).
    const design = await bombDesign(700, "head");
    const started = performance.now();
    const checked = checkFonts(createEditorState(design));
    const elapsed = performance.now() - started;
    expect(checked.issues).toEqual([
      {
        source: "font",
        path: "/assets/fonts/f0",
        message: expect.stringMatching(
          /^font asset "f0" cannot be used: .*not checked$/u,
        ) as string,
      },
    ]);
    expect(checked.fontChecks).toEqual({});
    expect(elapsed).toBeLessThan(2_000 * loadScale());
  });

  test("a font that cannot be read after good ones keeps their checks and stops there", () => {
    const plain = `data:font/ttf;base64,${encodeBase64(testFonts.ttf.bytes)}`;
    const broken = `data:font/ttf;base64,${encodeBase64(testFonts.ttf.bytes.subarray(0, 200))}`;
    const state = createEditorState({
      ...newDesign(),
      assets: {
        fonts: {
          a: { family: "Montserrat", src: plain, licence },
          b: { family: "Montserrat", src: broken, licence },
          c: { family: "Montserrat", src: plain, licence },
        },
      },
    });
    const checked = checkFonts(state);
    expect(checked.fontChecks).toEqual({ a: { fsType: 0, embeddable: true } });
    expect(checked.issues).toMatchObject([{ source: "font", path: "/assets/fonts/b" }]);
  });

  test("a supplied file and a data URI are each charged once against the allowance", () => {
    // Five distinct 3.9 MB fonts: the fifth crosses 16 MiB whether it comes as a data URI or as attached bytes.
    const sources = woffBombs(5);
    const fonts = Object.fromEntries(
      sources.map((src, index) => [
        `f${String(index)}`,
        { family: "Readmint Test Symbols", src, licence },
      ]),
    );
    const state = createEditorState({ ...newDesign(), assets: { fonts } });
    const bytes = (index: number) => decodeDataUri(sources[index] ?? "") ?? new Uint8Array();
    const attached = { ...state, sessionAssets: { fonts: { f4: bytes(4) } } };
    for (const checked of [checkFonts(state), checkFonts(attached)]) {
      expect(checked.issues).toMatchObject([
        {
          path: "/assets/fonts/f4",
          message: expect.stringContaining("maxTotalFontBytes") as string,
        },
      ]);
    }
  });

  test("ordinary fonts are all checked", () => {
    const restricted = `data:font/ttf;base64,${encodeBase64(testFonts.restricted.bytes)}`;
    const plain = `data:font/ttf;base64,${encodeBase64(testFonts.ttf.bytes)}`;
    const state = createEditorState({
      ...newDesign(),
      assets: {
        fonts: {
          a: { family: "Montserrat", src: plain, licence },
          b: { family: "Montserrat", src: restricted, licence: { embedding: "restricted" } },
          c: { family: "Montserrat", src: plain, licence },
          d: { family: "Montserrat", src: "fonts/d.ttf", licence },
        },
      },
    });
    expect(checkFonts(state).fontChecks).toEqual({
      a: { fsType: 0, embeddable: true },
      b: { fsType: 2, embeddable: false },
      c: { fsType: 0, embeddable: true },
    });
    const attached = { ...state, sessionAssets: { fonts: { d: testFonts.restricted.bytes } } };
    expect(checkFonts(attached).fontChecks.d).toEqual({ fsType: 2, embeddable: false });
  });
});
