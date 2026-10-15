import { DesignLimits } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import {
  addLayer,
  createEditorState,
  EditorLimits,
  exportDesign,
  importDesign,
  newDesign,
  renderPreview,
  uploadImage,
} from "../src/index.js";
import { testImages } from "./testImages.js";

const empty = createEditorState(newDesign());

describe("uploadImage", () => {
  test.each([
    ["png", "image/png", 24, 16],
    ["jpeg", "image/jpeg", 32, 16],
    ["gif", "image/gif", 16, 16],
    ["webp", "image/webp", undefined, undefined],
  ] as const)(
    "adds a %s as a data URI image asset and a layer of its size, selected",
    (kind, mime, width, height) => {
      // The extension lies: the type comes from the bytes.
      const next = uploadImage(empty, { name: "picture.svg", bytes: testImages[kind].bytes });
      expect(next.issues).toEqual([]);
      const src = next.design.assets?.images?.picture?.src ?? "";
      expect(src.startsWith(`data:${mime};base64,`)).toBe(true);
      const layer = next.design.layers[0];
      expect(layer).toMatchObject({ type: "image", id: "picture", asset: "picture", x: 0, y: 0 });
      if (width !== undefined) expect(layer).toMatchObject({ width, height });
      expect(next.selection).toBe("/layers/0");
      const result = renderPreview(next);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.svg).toContain(`href="data:${mime};base64,`);
    },
  );

  test("goes into the group it is given", () => {
    const grouped = addLayer(empty, "group");
    const next = uploadImage(grouped, testImages.png, "/layers/0");
    expect(next.issues).toEqual([]);
    expect(next.design.layers[0]).toMatchObject({
      type: "group",
      children: [{ type: "image", asset: "pattern" }],
    });
    expect(next.selection).toBe("/layers/0/children/0");
  });

  test("sizes a layer as the image shows: EXIF orientation 6 swaps width and height", () => {
    const next = uploadImage(empty, testImages.turnedJpeg);
    expect(next.design.layers[0]).toMatchObject({ width: 16, height: 32 });
  });

  test("scales a large image down to fit the canvas, never up", () => {
    const big = uploadImage(empty, { name: "big.png", bytes: testImages.resizedPng(800, 400) });
    // Canvas 400x120: the height decides.
    expect(big.design.layers[0]).toMatchObject({ width: 240, height: 120 });
    const thin = uploadImage(empty, { name: "thin.png", bytes: testImages.resizedPng(8000, 1) });
    expect(thin.design.layers[0]).toMatchObject({ width: 400, height: 1 });
    const bound = createEditorState({
      ...newDesign(),
      canvas: { width: "{{size}}", height: 120 },
    });
    const free = uploadImage(bound, { name: "big.png", bytes: testImages.resizedPng(800, 60) });
    expect(free.design.layers[0]).toMatchObject({ width: 800, height: 60 });
  });

  test("gives each upload its own asset and layer id, prototype names included", () => {
    let next = uploadImage(empty, { name: "constructor.png", bytes: testImages.png.bytes });
    next = uploadImage(next, { name: "constructor.png", bytes: testImages.png.bytes });
    next = uploadImage(next, { name: "__proto__.png", bytes: testImages.png.bytes });
    next = uploadImage(next, { name: "1 2 3.png", bytes: testImages.png.bytes });
    expect(next.issues).toEqual([]);
    expect(Object.keys(next.design.assets?.images ?? {})).toEqual([
      "constructor",
      "constructor-2",
      "proto__",
      "image",
    ]);
    expect(next.design.layers.map((layer) => layer.id)).toEqual([
      "constructor",
      "constructor-2",
      "proto__",
      "image",
    ]);
    expect(renderPreview(next).ok).toBe(true);
  });

  test("an uploaded image survives export and import", async () => {
    const next = uploadImage(empty, testImages.png);
    expect(await importDesign(exportDesign(next.design))).toEqual({
      ok: true,
      value: next.design,
    });
  });
});

describe("uploadImage refuses an image it cannot use and keeps the design", () => {
  test("a file over maxImageBytes, before it is sniffed", () => {
    expect(EditorLimits.maxImageBytes).toBe(RenderLimits.maxImageBytes);
    // A valid PNG header, then nothing: only the size check words the issue this way.
    const bytes = new Uint8Array(EditorLimits.maxImageBytes + 1);
    bytes.set(testImages.png.bytes);
    const next = uploadImage(empty, { name: "big.png", bytes });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toEqual([
      {
        source: "image",
        message: 'image "big.png" is 4194305 bytes, more than the 4194304 an image may have',
      },
    ]);
  });

  test.each([
    ["garbage", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "not a PNG, JPEG, GIF or WebP image"],
    ["a truncated PNG", testImages.png.bytes.subarray(0, 20), "truncated"],
    [
      "an SVG",
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      "SVG images are refused",
    ],
  ])("%s", (_name, bytes, reason) => {
    const next = uploadImage(empty, { name: "x.png", bytes });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toHaveLength(1);
    expect(next.issues[0]?.source).toBe("image");
    expect(next.issues[0]?.message).toMatch(/^image "x\.png" cannot be used: /u);
    expect(next.issues[0]?.message).toContain(reason);
  });

  test.each([
    [8193, 1, "is 8193x1 pixels; each side may be at most 8192"],
    [1, 8193, "is 1x8193 pixels; each side may be at most 8192"],
  ])("a side over maxImageSide (%sx%s)", (width, height, message) => {
    expect(RenderLimits.maxImageSide).toBe(8192);
    const next = uploadImage(empty, {
      name: "wide.png",
      bytes: testImages.resizedPng(width, height),
    });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toEqual([{ source: "image", message: `image "wide.png" ${message}` }]);
  });

  test("more animation frames than maxAnimationFrames", () => {
    expect(RenderLimits.maxAnimationFrames).toBe(1000);
    const ok = uploadImage(empty, { name: "a.png", bytes: testImages.animatedPng(1000) });
    expect(ok.issues).toEqual([]);
    const next = uploadImage(empty, { name: "a.png", bytes: testImages.animatedPng(1001) });
    expect(next.design).toBe(empty.design);
    expect(next.issues).toEqual([
      { source: "image", message: 'image "a.png" has more than 1000 animation frames' },
    ]);
  });

  test("an image that would make the design file longer than maxSourceLength", () => {
    const dataUri = Math.ceil(testImages.png.bytes.length / 3) * 4;
    const filler = `data:image/png;base64,${"A".repeat(DesignLimits.maxSourceLength - dataUri)}`;
    const big = createEditorState({
      ...newDesign(),
      assets: { images: { filler: { src: filler } } },
    });
    const next = uploadImage(big, testImages.png);
    expect(next.design).toBe(big.design);
    expect(next.issues).toMatchObject([
      {
        source: "image",
        message: new RegExp(
          `the design file would be [0-9]+ characters long, more than the ${String(DesignLimits.maxSourceLength)} a design may have`,
          "u",
        ),
      },
    ]);
  });

  test("a group that is not one", () => {
    const rect = addLayer(empty, "rect");
    const next = uploadImage(rect, testImages.png, "/layers/0");
    expect(next.design).toBe(rect.design);
    expect(next.issues).toMatchObject([{ source: "image", path: "/layers/0" }]);
  });
});
