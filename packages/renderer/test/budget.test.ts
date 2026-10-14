import type { Design, Layer } from "@readmint/format";
import { expect, test } from "vitest";
import { RenderLimits, renderSvg } from "../src/index.js";
import { minimumNodeBytes } from "../src/expandLayers.js";
import { utf8Length } from "../src/utf8Length.js";
import { fontAssets } from "./testAssets.js";

test("the default output budget is the camo content length limit", () => {
  expect(RenderLimits.maxOutputBytes).toBe(5_242_880);
  expect(Object.isFrozen(RenderLimits)).toBe(true);
});

test("output over the budget fails with too-large naming the limit", () => {
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { fonts: { m: fontAssets.medium } },
    layers: [{ type: "text", content: "x", font: "m" }],
  };
  const result = renderSvg(design, { limits: { maxOutputBytes: 100_000 } });
  expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "too-large" }] });
  expect(result.ok ? "" : result.issues[0]?.message).toContain("100000 bytes");
});

test("a huge nested repeat from data stops early instead of building everything", () => {
  // 10000 is the most items one repeat takes (expr); nested, that is 10^8 possible rects.
  const items = new Array<number>(10_000).fill(1);
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 100 },
    layers: [
      {
        type: "group",
        repeat: { each: "{{items}}", as: "row" },
        children: [{ type: "rect", width: 1, height: 1, repeat: { each: "{{items}}" } }],
      },
    ],
  };
  const started = performance.now();
  const result = renderSvg(design, { data: { items } });
  expect(result).toMatchObject({ ok: false, issues: [{ code: "too-large" }] });
  expect(performance.now() - started).toBeLessThan(2000);
});

test.each([
  ["a long path", { type: "path", d: `M0 0${" l1 1".repeat(19_999)}`, stroke: "#000" }],
  ["a long text", { type: "text", content: "{{long}}", width: 200, font: "m" }],
] as const)("nested repeats of %s stop with too-large well under a second", (_name, leaf) => {
  const items = Array.from({ length: 1000 }, (_, index) => index);
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { fonts: { m: fontAssets.medium } },
    layers: [
      {
        type: "group",
        repeat: { each: "{{items}}", as: "outer" },
        children: [{ ...(leaf as Layer), repeat: { each: "{{items}}" } }],
      },
    ],
  };
  const long = "word ".repeat(2000);
  const started = performance.now();
  const result = renderSvg(design, { data: { items, long } });
  const elapsed = performance.now() - started;
  expect(result).toMatchObject({ ok: false, issues: [{ code: "too-large" }] });
  expect(elapsed).toBeLessThan(500);
});

test("a 10000-rect design renders in under 2 s and the report counts UTF-8 bytes", () => {
  const layers: Layer[] = Array.from({ length: 10_000 }, (_, index) => ({
    type: "rect",
    x: index % 100,
    y: Math.floor(index / 100),
    width: 1,
    height: 1,
    fill: "#2ea043",
  }));
  const design: Design = {
    version: 0,
    title: "Größe ✓ 😀",
    canvas: { width: 100, height: 100 },
    layers,
  };
  const started = performance.now();
  const result = renderSvg(design);
  expect(performance.now() - started).toBeLessThan(2000);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.bytes).toBe(utf8Length(result.svg));
  expect(result.report.bytes).toBe(new TextEncoder().encode(result.svg).length);
  expect(result.report.limit).toBe(5_242_880);
});

test("the report lists embedded fonts and images once each, in first-use order", () => {
  const result = renderSvg({
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { fonts: { m: fontAssets.medium } },
    layers: [
      { type: "text", content: "a", font: "m" },
      { type: "text", content: "b", font: "m" },
    ],
  });
  expect(result.ok && result.report.fonts).toEqual([
    { asset: "m", bytes: fontAssets.medium.src.length },
  ]);
  expect(result.ok && result.report.images).toEqual([]);
});

test("the bytes reserved per node never exceed what the smallest node of its kind writes", () => {
  const smallest: Layer[] = [
    { type: "group", children: [] },
    { type: "rect", width: 1, height: 1 },
    { type: "ellipse", width: 1, height: 1 },
    { type: "path", d: "M" },
    { type: "path", d: "M0 0 L1 1 L2 0 Z" },
    { type: "text", content: "", font: "m" },
    { type: "text", content: "a b c d\r\ne f", width: 1, font: "m" },
    { type: "image", asset: "i", width: 1, height: 1, fit: "fill" },
  ];
  const reserved = (layer: Layer) =>
    minimumNodeBytes[layer.type] +
    (layer.type === "path" ? layer.d.length : layer.type === "text" ? layer.content.length : 0);
  for (const layer of smallest) {
    const empty = renderSvg({ version: 0, canvas: { width: 1, height: 1 }, layers: [] });
    const one = renderSvg({
      version: 0,
      canvas: { width: 1, height: 1 },
      assets: {
        fonts: { m: { ...fontAssets.medium, family: "M" } },
        images: { i: { src: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=" } },
      },
      layers: [layer],
    });
    if (!empty.ok || !one.ok) throw new Error(layer.type);
    const markup = one.svg.replace(/<defs>.*<\/defs>/u, "").length - empty.svg.length;
    expect(markup, layer.type).toBeGreaterThanOrEqual(reserved(layer));
  }
});

test("utf8Length counts like TextEncoder, lone surrogates included", () => {
  for (const text of ["", "abc", "é", "€", "😀", "a\uD800b", "\uDC00", "x😀y€"]) {
    expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
  }
});

test("limit overrides that are not finite, non-negative numbers are ignored", () => {
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [{ type: "rect", width: 1, height: 1 }],
  };
  for (const maxOutputBytes of [Number.NaN, -1, Infinity]) {
    const result = renderSvg(design, { limits: { maxOutputBytes } });
    expect(result.ok && result.report.limit).toBe(5_242_880);
  }
  expect(renderSvg(design, { limits: { maxOutputBytes: 10 } })).toMatchObject({ ok: false });
});
