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

// 10000 is the most items one repeat takes (expr); nested, that is 10^8 possible rects.
const hugeItems = new Array<number>(10_000).fill(1);
const hugeNestedRepeat: Design = {
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

test("a huge nested repeat stops at the output budget before building everything", () => {
  // The copy limit lifted, only the bytes each node reserves before it is built stop the expansion.
  const started = performance.now();
  const result = renderSvg(hugeNestedRepeat, {
    data: { items: hugeItems },
    limits: { maxRepeatCopies: 1e9 },
  });
  expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "too-large" }] });
  expect(result.ok ? "" : result.issues[0]?.message).toContain("5242880 bytes");
  expect(performance.now() - started).toBeLessThan(2000);
});

test("a huge nested repeat stops at the copy limit first by default", () => {
  const started = performance.now();
  const result = renderSvg(hugeNestedRepeat, { data: { items: hugeItems } });
  // The copy limit (10000 outer + 10000 per outer item) is passed at outer item 9, before the output budget.
  expect(result).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/children/0/repeat", code: "too-large" }],
  });
  expect(result.ok ? "" : result.issues[0]?.message).toContain("repeat item 9");
  expect(performance.now() - started).toBeLessThan(2000);
});

test.each([
  ["an if", { if: "{{ false }}" }],
  ["visible: false", { visible: false }],
] as const)("copies %s drops count toward maxRepeatCopies", (_name, drop) => {
  const items = Array.from({ length: 400 }, (_, index) => index);
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [
      {
        type: "group",
        repeat: { each: "{{ items }}", as: "row" },
        children: [{ type: "rect", width: 1, height: 1, ...drop, repeat: { each: "{{ items }}" } }],
      },
    ],
  };
  const started = performance.now();
  const result = renderSvg(design, { data: { items } });
  expect(performance.now() - started).toBeLessThan(500);
  expect(result).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/children/0/repeat", code: "too-large" }],
  });
  const message = result.ok ? "" : (result.issues[0]?.message ?? "");
  expect(message).toContain("100000");
  expect(message).toContain("repeat item 249");
});

test("maxRepeatCopies defaults to 100000 and can be overridden", () => {
  expect(RenderLimits.maxRepeatCopies).toBe(100_000);
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [{ type: "rect", width: 1, height: 1, repeat: { each: "{{ list }}" } }],
  };
  const limits = { maxRepeatCopies: 3 };
  expect(renderSvg(design, { data: { list: [1, 2, 3] }, limits }).ok).toBe(true);
  const over = renderSvg(design, { data: { list: [1, 2, 3, 4] }, limits });
  expect(over).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/repeat", code: "too-large" }],
  });
  expect(over.ok ? "" : over.issues[0]?.message).toBe(
    "this repeat brings the render to 4 copies; at most 3 are allowed (copies an if or visible drops count too)",
  );
});

test("a repeat inside a component passes maxRepeatCopies at the definition, naming the instance", () => {
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    components: {
      dots: {
        layers: [{ type: "rect", width: 1, height: 1, repeat: { each: "{{ list }}" } }],
      },
    },
    layers: [
      { type: "component", ref: "dots" },
      { type: "component", ref: "dots" },
    ],
  };
  const result = renderSvg(design, { data: { list: [1, 2] }, limits: { maxRepeatCopies: 3 } });
  expect(result).toMatchObject({
    ok: false,
    issues: [{ path: "/components/dots/layers/0/repeat", code: "too-large" }],
  });
  expect(result.ok ? "" : result.issues[0]?.message).toContain("(in component instance /layers/1)");
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
  // The output budget (a path reserves its data, a text its content) trips long before the copy limit.
  expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "too-large" }] });
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

test("expression work of the whole render is bounded, also for copies an if drops", () => {
  const items = Array.from({ length: 1000 }, (_, index) => index);
  const heavy = `{{ (s${" | upper | lower".repeat(4)}) == "" }}` as const;
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [
      {
        type: "group",
        repeat: { each: "{{ items }}", as: "row" },
        children: [
          { type: "rect", width: 1, height: 1, if: heavy, repeat: { each: "{{ items }}" } },
        ],
      },
    ],
  };
  const started = performance.now();
  const result = renderSvg(design, { data: { items, s: "a".repeat(10_000) } });
  expect(performance.now() - started).toBeLessThan(2000);
  expect(result).toMatchObject({ ok: false, issues: [{ code: "binding" }] });
  expect(result.ok ? "" : result.issues[0]?.message).toContain("(budget)");
});

test("the step budget is shared by the render and can be lowered", () => {
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [{ type: "rect", width: "{{ w }}", height: 1, repeat: { each: "{{ list }}" } }],
  };
  const data = { w: 2, list: [1, 2, 3, 4, 5] };
  expect(renderSvg(design, { data }).ok).toBe(true);
  const lowered = renderSvg(design, { data, limits: { maxExpressionSteps: 8 } });
  expect(lowered).toMatchObject({ ok: false, issues: [{ code: "binding" }] });
  expect(lowered.ok ? "" : lowered.issues[0]?.message).toContain("(budget)");
  expect(RenderLimits.maxExpressionSteps).toBe(5_000_000);
});
