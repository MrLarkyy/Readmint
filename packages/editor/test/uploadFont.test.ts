import { DesignLimits, type Design } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import {
  addLayer,
  checkFonts,
  createEditorState,
  EditorLimits,
  exportDesign,
  type FontAssetChange,
  importDesign,
  newDesign,
  renderPreview,
  setFontAsset,
  uploadFont,
} from "../src/index.js";
import { encodeBase64 } from "../src/base64.js";
import { testFonts } from "./testFonts.js";

const empty = createEditorState(newDesign());

describe("uploadFont", () => {
  test.each(["ttf", "otf", "woff", "woff2"] as const)(
    "adds a %s as a data URI font asset",
    (kind) => {
      const next = uploadFont(empty, testFonts[kind]);
      expect(next.issues).toEqual([]);
      const asset = next.design.assets?.fonts?.["Montserrat-Medium"];
      expect(asset).toMatchObject({
        family: "Montserrat",
        weight: 500,
        licence: { embedding: "allowed" },
      });
      expect(asset?.src.startsWith(`data:font/${kind};base64,`)).toBe(true);
      expect(next.fontChecks["Montserrat-Medium"]).toEqual({ fsType: 0, embeddable: true });
    },
  );

  test("gives a second upload of the same file its own id", () => {
    const twice = uploadFont(uploadFont(empty, testFonts.ttf), testFonts.ttf);
    expect(Object.keys(twice.design.assets?.fonts ?? {})).toEqual([
      "Montserrat-Medium",
      "Montserrat-Medium-2",
    ]);
  });

  test("stores a font whose fsType forbids embedding as restricted: drawn as paths", () => {
    let next = uploadFont(empty, testFonts.restricted);
    expect(next.design.assets?.fonts?.["Montserrat-Restricted"]?.licence).toEqual({
      embedding: "restricted",
    });
    expect(next.fontChecks["Montserrat-Restricted"]).toEqual({ fsType: 2, embeddable: false });
    next = addLayer(next, "text");
    const result = renderPreview(next);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("@font-face");
    expect(result.report.fonts).toMatchObject([{ drawnAs: "paths" }]);
  });

  test("never lets a restricted font be loosened; an allowed one may be restricted and back", () => {
    const restricted = uploadFont(empty, testFonts.restricted);
    const loosened = setFontAsset(restricted, "Montserrat-Restricted", { embedding: "allowed" });
    expect(loosened.design).toBe(restricted.design);
    expect(loosened.issues).toMatchObject([{ source: "font", message: /fsType \(0x0002\)/u }]);
    const allowed = uploadFont(empty, testFonts.ttf);
    const tightened = setFontAsset(allowed, "Montserrat-Medium", { embedding: "restricted" });
    expect(tightened.design.assets?.fonts?.["Montserrat-Medium"]?.licence.embedding).toBe(
      "restricted",
    );
    const back = setFontAsset(tightened, "Montserrat-Medium", {
      embedding: "allowed",
      licenceName: "OFL-1.1",
    });
    expect(back.design.assets?.fonts?.["Montserrat-Medium"]?.licence).toEqual({
      embedding: "allowed",
      name: "OFL-1.1",
    });
  });

  test("checkFonts reads the fsType again from the data URI of an imported design", () => {
    const restricted = uploadFont(empty, testFonts.restricted);
    const reopened = checkFonts(createEditorState(restricted.design));
    expect(reopened.fontChecks).toEqual({
      "Montserrat-Restricted": { fsType: 2, embeddable: false },
    });
    const loosened = setFontAsset(reopened, "Montserrat-Restricted", { embedding: "allowed" });
    expect(loosened.design).toBe(reopened.design);
  });

  test("refuses a file over maxFontBytes before parsing it", () => {
    expect(EditorLimits.maxFontBytes).toBe(RenderLimits.maxFontBytes);
    expect(EditorLimits.maxImageBytes).toBe(RenderLimits.maxImageBytes);
    // Valid TTF magic, then nothing a parser could read: only the size check words the issue this way.
    const bytes = new Uint8Array(EditorLimits.maxFontBytes + 1);
    bytes.set([0, 1, 0, 0]);
    const next = uploadFont(empty, { name: "big.ttf", bytes });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toEqual([
      {
        source: "font",
        message: 'font "big.ttf" is 4194305 bytes, more than the 4194304 a font may have',
      },
    ]);
  });

  test.each([
    ["garbage", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])],
    ["a truncated font", testFonts.ttf.bytes.subarray(0, 200)],
    ["a collection", new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0, 0, 0])],
  ])("reports %s as an issue and keeps the design", (_name, bytes) => {
    const next = uploadFont(empty, { name: "x.ttf", bytes });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toMatchObject([{ source: "font", message: /cannot be used/u }]);
  });

  test("refuses a font that would make the design file longer than maxSourceLength", () => {
    // An image asset whose data URI fills the file up to the space the font would need.
    const dataUri = Math.ceil(testFonts.ttf.bytes.length / 3) * 4;
    const filler = `data:image/png;base64,${"A".repeat(DesignLimits.maxSourceLength - dataUri)}`;
    const big = createEditorState({
      ...newDesign(),
      assets: { images: { filler: { src: filler } } },
    });
    const next = uploadFont(big, testFonts.ttf);
    expect(next.design).toBe(big.design);
    expect(next.issues).toMatchObject([
      {
        source: "font",
        message: new RegExp(
          `the design file would be [0-9]+ characters long, more than the ${String(DesignLimits.maxSourceLength)} a design may have`,
          "u",
        ),
      },
    ]);
  });
});

describe("font asset ids named like Object.prototype members", () => {
  test.each(["constructor", "prototype", "toString"])(
    "a font with the id %s is added, restricted, locked and changed like any other",
    (id) => {
      const restricted = uploadFont(empty, {
        name: `${id}.ttf`,
        bytes: testFonts.restricted.bytes,
      });
      expect(restricted.issues).toEqual([]);
      expect(Object.keys(restricted.design.assets?.fonts ?? {})).toEqual([id]);
      expect(restricted.fontChecks[id]).toEqual({ fsType: 2, embeddable: false });
      const loosened = setFontAsset(restricted, id, { embedding: "allowed" });
      expect(loosened.design).toBe(restricted.design);
      expect(loosened.issues).toMatchObject([{ source: "font", message: /fsType/u }]);
      const named = setFontAsset(restricted, id, { licenceName: "OFL-1.1" });
      expect(named.issues).toEqual([]);
      expect(named.design.assets?.fonts?.[id]?.licence).toEqual({
        embedding: "restricted",
        name: "OFL-1.1",
      });
      expect(checkFonts(createEditorState(named.design)).fontChecks[id]).toEqual({
        fsType: 2,
        embeddable: false,
      });

      const allowed = uploadFont(empty, { name: `${id}.ttf`, bytes: testFonts.ttf.bytes });
      const tightened = setFontAsset(allowed, id, { embedding: "restricted" });
      expect(tightened.design.assets?.fonts?.[id]?.licence.embedding).toBe("restricted");
    },
  );

  test("an id no font has is refused, even when a prototype has it", () => {
    const next = setFontAsset(empty, "constructor", { embedding: "restricted" });
    expect(next.issues).toMatchObject([{ source: "font", message: "no such font" }]);
  });
});

describe("setFontAsset keeps every field it does not change", () => {
  const src = `data:font/ttf;base64,${encodeBase64(testFonts.ttf.bytes)}`;
  const designWith = (reservedFontName: boolean): Design => ({
    ...newDesign(),
    assets: {
      fonts: {
        m: {
          family: "Montserrat",
          src,
          weight: 500,
          licence: { embedding: "allowed", name: "OFL-1.1", reservedFontName },
          kerning: false,
        },
      },
    },
    layers: [{ type: "text", content: "Hi", font: "m", fontSize: 20, fill: "#000000" }],
  });
  const changes: [string, FontAssetChange][] = [
    ["an embedding change", { embedding: "allowed" }],
    ["a name change", { licenceName: "OFL-1.1-no-RFN" }],
    ["a name removal", { licenceName: "" }],
  ];

  test.each(
    [true, false].flatMap((reserved) =>
      changes.map(([what, change]) => [reserved, what, change] as const),
    ),
  )("reservedFontName %s survives %s", async (reserved, _what, change) => {
    const edited = setFontAsset(createEditorState(designWith(reserved)), "m", change);
    expect(edited.issues).toEqual([]);
    const reopened = await importDesign(exportDesign(edited.design));
    const asset = reopened.ok ? reopened.value.assets?.fonts?.m : undefined;
    expect(asset?.licence.reservedFontName).toBe(reserved);
    expect(asset).toMatchObject({ weight: 500, kerning: false });
    const result = renderPreview(edited);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.includes("@font-face")).toBe(!reserved);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      reserved ? ["font-reserved-name"] : [],
    );
  });

  test("the name is set and removed without touching the other licence fields", () => {
    const state = createEditorState(designWith(true));
    const renamed = setFontAsset(state, "m", { licenceName: "OFL-1.1-RFN" });
    expect(renamed.design.assets?.fonts?.m?.licence).toEqual({
      embedding: "allowed",
      name: "OFL-1.1-RFN",
      reservedFontName: true,
    });
    const unnamed = setFontAsset(renamed, "m", { licenceName: "" });
    expect(unnamed.design.assets?.fonts?.m?.licence).toEqual({
      embedding: "allowed",
      reservedFontName: true,
    });
    const restricted = setFontAsset(unnamed, "m", { embedding: "restricted" });
    expect(restricted.design.assets?.fonts?.m?.licence).toEqual({
      embedding: "restricted",
      reservedFontName: true,
    });
  });
});
