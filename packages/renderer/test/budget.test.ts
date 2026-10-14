import type { AnimationTrack, Design, Layer } from "@readmint/format";
import { expect, test } from "vitest";
import { RenderLimits, renderSvg } from "../src/index.js";
import { minimumNodeBytes } from "../src/expandLayers.js";
import type { AnimatedProperty } from "../src/NodeAnimation.js";
import { minimumTrackBytes } from "../src/resolveAnimation.js";
import { utf8Length } from "../src/utf8Length.js";
import { fontAssets, imageAssets } from "./testAssets.js";

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

const tinyGif = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=";

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
        images: { i: { src: tinyGif } },
      },
      layers: [layer],
    });
    if (!empty.ok || !one.ok) throw new Error(layer.type);
    const markup = one.svg.replace(/<defs>.*<\/defs>/u, "").length - empty.svg.length;
    expect(markup, layer.type).toBeGreaterThanOrEqual(reserved(layer));
  }
  const empty = renderSvg({ version: 0, canvas: { width: 1, height: 1 }, layers: [] });
  const shared = renderSvg(
    {
      version: 0,
      canvas: { width: 1, height: 1 },
      assets: { images: { i: { src: tinyGif } } },
      layers: [
        {
          type: "image",
          asset: "i",
          width: 1,
          height: 1,
          fit: "fill",
          repeat: { each: "{{two}}" },
        },
      ],
    },
    { data: { two: [0, 0] } },
  );
  if (!empty.ok || !shared.ok) throw new Error("shared image");
  const uses = shared.svg.replace(/<defs>.*<\/defs>/u, "").length - empty.svg.length;
  expect(uses / 2, "shared image").toBeGreaterThanOrEqual(minimumNodeBytes.image);
});

/** A real PNG padded after its end to about `size` bytes: sniffed like the PNG, inlined at full size. */
function paddedPng(size: number): Uint8Array {
  const png = Buffer.from(
    imageAssets.png.src.slice(imageAssets.png.src.indexOf(",") + 1),
    "base64",
  );
  const padded = new Uint8Array(size);
  padded.set(png);
  return padded;
}

test("40000 copies of a 2 MB image under a second asset id with the same bytes render in under 2 s", () => {
  const data = paddedPng(1_500_000);
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { images: { first: { src: "a.png" }, second: { src: "b.png" } } },
    layers: [
      { type: "image", asset: "first", width: 10, height: 10 },
      {
        type: "group",
        repeat: { each: "{{items}}" },
        children: [
          { type: "image", asset: "second", width: 10, height: 10, repeat: { each: "{{items}}" } },
        ],
      },
    ],
  };
  const started = performance.now();
  const result = renderSvg(design, {
    data: { items: new Array<number>(200).fill(0) },
    // Separate copies of the bytes, so nothing but their content makes the two assets alike.
    assets: { images: { first: data, second: data.slice() } },
    limits: { maxOutputBytes: 20_000_000 },
  });
  expect(performance.now() - started).toBeLessThan(2000);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const dataUri = `data:image/png;base64,${Buffer.from(data).toString("base64")}`;
  expect(result.svg.split(dataUri)).toHaveLength(2);
  expect(result.report.images).toEqual([
    { asset: "first", bytes: dataUri.length },
    { asset: "second", bytes: 0 },
  ]);
});

test("1000 copies of a 1 MB image write its data once, in under 2 s", () => {
  const big = paddedPng(750_000);
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { images: { big: { src: "big.png" } } },
    layers: [{ type: "image", asset: "big", width: 10, height: 10, repeat: { each: "{{items}}" } }],
  };
  const options = {
    data: { items: new Array<number>(1000).fill(0) },
    assets: { images: { big } },
  };
  const started = performance.now();
  const result = renderSvg(design, options);
  expect(performance.now() - started).toBeLessThan(2000);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const dataUri = `data:image/png;base64,${Buffer.from(big).toString("base64")}`;
  expect(result.svg.split(dataUri)).toHaveLength(2);
  expect(result.report.images).toEqual([{ asset: "big", bytes: dataUri.length }]);
  expect(result.report.bytes).toBeLessThan(dataUri.length + 1000 * 200);

  // The one definition is still charged: a budget below the data fails like before.
  const tight = renderSvg(design, { ...options, limits: { maxOutputBytes: dataUri.length - 1 } });
  expect(tight).toMatchObject({ ok: false, issues: [{ path: "", code: "too-large" }] });
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

function fadeIn(extra: Record<string, unknown>) {
  return {
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 1, value: 1 },
    ],
    duration: 300,
    ...extra,
  } as AnimationTrack<number>;
}

test("a 53 x 7 staggered calendar renders in under 1 s and under 200 kB", () => {
  const delay = { delay: "{{(week * 7 + day) * 8}}" } as const;
  const design: Design = {
    version: 0,
    canvas: { width: 800, height: 120 },
    animation: { duration: 4000 },
    layers: [
      {
        type: "group",
        layout: { type: "stack", direction: "row", gap: 3 },
        children: [
          {
            type: "group",
            repeat: { each: "{{weeks}}", index: "week" },
            layout: { type: "stack", direction: "column", gap: 3 },
            children: [
              {
                type: "rect",
                width: 11,
                height: 11,
                radius: 2,
                fill: "{{colour}}",
                repeat: { each: "{{days}}", as: "colour", index: "day" },
                animate: {
                  opacity: fadeIn(delay),
                  scale: { ...fadeIn(delay), easing: "ease-out" },
                  fill: {
                    keyframes: [
                      { offset: 0, value: "#ebedf0" },
                      { offset: 1, value: "{{colour}}" },
                    ],
                    duration: 300,
                    ...delay,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const data = {
    weeks: Array.from({ length: 53 }, (_, index) => index),
    days: ["#9be9a8", "#40c463", "#30a14e", "#216e39", "#9be9a8", "#40c463", "#30a14e"],
  };
  const started = performance.now();
  const result = renderSvg(design, { data });
  expect(performance.now() - started).toBeLessThan(1000);
  expect(result.ok ? result.warnings : result.issues).toEqual([]);
  expect(result.ok && result.report.bytes).toBeLessThan(200_000);
  expect(result.ok && result.svg.match(/<rect /gu)).toHaveLength(371);
});

test("10000 animated copies stop at the output budget before everything is built", () => {
  const started = performance.now();
  const result = renderSvg(
    {
      version: 0,
      canvas: { width: 100, height: 100 },
      animation: { duration: 60_000 },
      layers: [
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{items}}" },
          animate: {
            opacity: fadeIn({ stagger: 5 }),
            x: fadeIn({ stagger: 5 }),
            y: fadeIn({ stagger: 5 }),
            rotation: fadeIn({ stagger: 5 }),
            scale: fadeIn({ stagger: 5 }),
            fill: {
              keyframes: [
                { offset: 0, value: "#000000" },
                { offset: 1, value: "#ffffff" },
              ],
              stagger: 5,
            },
          },
        },
      ],
    },
    // The keyframe limit (120000 here) lifted, only the bytes each track reserves stop the expansion.
    { data: { items: hugeItems }, limits: { maxAnimationKeyframes: 1e9 } },
  );
  expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "too-large" }] });
  expect(performance.now() - started).toBeLessThan(1000);
});

test("the bytes reserved per animation track never exceed what the track adds to a frame", () => {
  const track = fadeIn({});
  const cases: [AnimatedProperty, Layer][] = [
    ["opacity", { type: "rect", width: 1, height: 1, animate: { opacity: track } }],
    ["x", { type: "rect", width: 1, height: 1, animate: { x: track } }],
    ["y", { type: "rect", width: 1, height: 1, animate: { y: track } }],
    ["rotation", { type: "rect", width: 1, height: 1, animate: { rotation: track } }],
    ["scale", { type: "rect", width: 1, height: 1, animate: { scale: track } }],
    ["draw", { type: "path", d: "M0 0 L1 0", animate: { draw: track } }],
  ];
  for (const [property, layer] of cases) {
    const still = Object.fromEntries(
      Object.entries(layer).filter(([key]) => key !== "animate"),
    ) as unknown as Layer;
    const render = (time: number | undefined, animated: Layer) => {
      const result = renderSvg(
        {
          version: 0,
          canvas: { width: 1, height: 1 },
          animation: { duration: 1000 },
          layers: [animated],
        },
        time === undefined ? {} : { time },
      );
      if (!result.ok) throw new Error(property);
      return result.svg.replace(/<defs>.*<\/defs>/u, "").length;
    };
    const plain = render(undefined, still);
    expect(render(500, layer) - plain, property).toBeGreaterThanOrEqual(
      minimumTrackBytes[property],
    );
    expect(render(undefined, layer) - plain, property).toBeGreaterThanOrEqual(
      minimumTrackBytes[property],
    );
  }
});

/** 32 keyframes, the most a track takes, at offsets the stagger shifts per copy so no two copies share CSS. */
function longTrack<T extends number | `#${string}`>(
  value: (index: number) => T,
): AnimationTrack<T> {
  return {
    keyframes: Array.from({ length: 32 }, (_, index) => ({
      offset: index / 31,
      value: value(index),
    })),
    duration: 1000,
    stagger: 1,
  };
}

// 70 x 1000 path copies with three tracks that reserve no output bytes: 6.7 million keyframes unbounded.
const manyKeyframes: Design = {
  version: 0,
  canvas: { width: 100, height: 100 },
  animation: { duration: 60_000 },
  layers: [
    {
      type: "group",
      repeat: { each: "{{rows}}" },
      children: [
        {
          type: "path",
          d: "M0 0 L1 1",
          repeat: { each: "{{items}}" },
          animate: {
            opacity: longTrack((index) => (index % 2 === 0 ? 0 : 1)),
            fill: longTrack((index) => (index % 2 === 0 ? "#000000" : "#ffffff")),
            stroke: longTrack((index) => (index % 2 === 0 ? "#ff0000" : "#0000ff")),
          },
        },
      ],
    },
  ],
};
const manyKeyframesData = {
  rows: Array.from({ length: 70 }, (_, index) => index),
  items: Array.from({ length: 1000 }, (_, index) => index),
};

test.each([
  ["the animated SVG", undefined],
  ["a frame", 500],
] as const)("tracks over many copies stop %s at maxAnimationKeyframes fast", (_name, time) => {
  const started = performance.now();
  const result = renderSvg(manyKeyframes, {
    data: manyKeyframesData,
    ...(time === undefined ? {} : { time }),
  });
  const elapsed = performance.now() - started;
  expect(result).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/children/0/animate/stroke", code: "too-large" }],
  });
  // 96 keyframes a copy: the 1042nd copy (row 1, item 41) crosses 100000.
  expect(result.ok ? "" : result.issues[0]?.message).toBe(
    "this track brings the render to 100032 animation keyframes; at most 100000 are allowed (every repeat copy counts) (repeat item 1, repeat item 41)",
  );
  expect(elapsed).toBeLessThan(1000);
});

test("maxAnimationKeyframes defaults to 100000 and can be overridden", () => {
  expect(RenderLimits.maxAnimationKeyframes).toBe(100_000);
  const design: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    animation: { duration: 1000 },
    layers: [
      {
        type: "rect",
        width: 1,
        height: 1,
        repeat: { each: "{{ list }}" },
        animate: { opacity: fadeIn({}), x: fadeIn({}) },
      },
    ],
  };
  const limits = { maxAnimationKeyframes: 8 };
  expect(renderSvg(design, { data: { list: [1, 2] }, limits }).ok).toBe(true);
  expect(renderSvg(design, { data: { list: [1, 2] }, limits, time: 100 }).ok).toBe(true);
  for (const time of [undefined, 100]) {
    const over = renderSvg(design, {
      data: { list: [1, 2, 3] },
      limits,
      ...(time === undefined ? {} : { time }),
    });
    expect(over).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/opacity", code: "too-large" }],
    });
    expect(over.ok ? "" : over.issues[0]?.message).toContain("10 animation keyframes; at most 8");
  }
  for (const maxAnimationKeyframes of [Number.NaN, -1, Infinity]) {
    expect(
      renderSvg(design, { data: { list: [1, 2, 3] }, limits: { maxAnimationKeyframes } }).ok,
    ).toBe(true);
  }
});
