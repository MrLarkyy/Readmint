import type { Colour, Design, Paint } from "@readmint/format";
import { expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture } from "./renderFixture.js";
import fontFormats from "./renderer-fonts-formats.golden.js";
import fonts from "./renderer-fonts.golden.js";
import layout from "./renderer-layout.golden.js";
import shapes from "./renderer-shapes.golden.js";
import text from "./renderer-text.golden.js";
import { fontAssets, imageAssets } from "./testAssets.js";

function ids(svg: string): string[] {
  return [...svg.matchAll(/ id="([^"]*)"/gu)].map((match) => match[1] ?? "");
}

function input(
  suite: { fixtures: { name: string; input: Parameters<typeof renderFixture>[0] }[] },
  name: string,
) {
  const fixture = suite.fixtures.find((candidate) => candidate.name === name);
  if (fixture === undefined) throw new Error(name);
  return fixture.input;
}

test("rendering A, B, A in one process gives the same bytes for both A renders", () => {
  const a = input(shapes, "rect-linear-gradient");
  const b = input(layout, "group-clip");
  const first = renderFixture(a);
  renderFixture(b);
  renderFixture(input(text, "text-gradient-fill"));
  expect(renderFixture(a)).toBe(first);
});

test.each(animationDesigns.map(({ name, input }) => [name, input] as const))(
  "the animated SVG and a frame of %s are the same bytes on every render",
  (_name, input) => {
    const first = renderFixture(input);
    const frame = renderFixture({ ...input, time: 333.3 });
    renderFixture(input);
    expect(renderFixture(input)).toBe(first);
    expect(renderFixture({ ...input, time: 333.3 })).toBe(frame);
  },
);

test.each(
  [...fonts.fixtures, ...fontFormats.fixtures].map(({ name, input }) => [name, input] as const),
)(
  "font fixture %s gives the same bytes after other fonts were subset in the same process",
  (_name, input) => {
    const first = renderFixture(input);
    for (const other of fonts.fixtures) renderFixture(other.input);
    expect(renderFixture(input)).toBe(first);
  },
);

test("ids are derived from the definition, not from what an earlier render wrote", () => {
  const linear = renderFixture(input(shapes, "rect-linear-gradient"));
  const radial = renderFixture(input(shapes, "ellipse-radial-gradient"));
  expect(ids(linear)).toEqual([expect.stringMatching(/^d[0-9a-z]{7}-g[0-9a-z]{7}$/u)]);
  expect(ids(radial)).toEqual([expect.stringMatching(/^d[0-9a-z]{7}-g[0-9a-z]{7}$/u)]);
  expect(ids(radial)).not.toEqual(ids(linear));
  const clip = renderFixture(input(layout, "group-clip"));
  expect(ids(clip)).toEqual([expect.stringMatching(/^d[0-9a-z]{7}-c[0-9a-z]{7}$/u)]);
});

function sharing(colour: Colour, clip: number, asset: "png" | "jpeg"): Design {
  const gradient = (stop: Colour): Paint => ({
    type: "linear",
    stops: [
      { offset: 0, color: stop },
      { offset: 1, color: "#ffffff" },
    ],
  });
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { images: imageAssets },
    layers: [
      { type: "rect", width: 10, height: 10, fill: gradient(colour) },
      { type: "rect", width: 10, height: 10, fill: gradient("#1a7f37") },
      {
        type: "group",
        width: clip,
        height: clip,
        clip: true,
        children: [{ type: "image", asset, width: 20, height: 20 }],
        repeat: { each: "{{two}}" },
      },
    ],
  };
}

function definitions(svg: string): Map<string, string> {
  const defs = /<defs>(.*)<\/defs>/u.exec(svg)?.[1] ?? "";
  return new Map(
    [
      ...defs.matchAll(
        /<(linearGradient|clipPath|symbol) id="([^"]+)".*?<\/\1>|<image id="([^"]+)"[^>]*\/>/gu,
      ),
    ].map((match) => [match[2] ?? match[3] ?? "", match[0]]),
  );
}

test("two different documents share no id, and equal definitions differ only by the prefix", () => {
  const data = { two: [0, 0] };
  const a = renderFixture({ design: sharing("#cf222e", 40, "png"), data });
  const b = renderFixture({ design: sharing("#0969da", 50, "jpeg"), data });
  expect(renderFixture({ design: sharing("#cf222e", 40, "png"), data })).toBe(a);
  const inA = definitions(a);
  const inB = definitions(b);
  const local = (id: string) => id.replace(/^d[0-9a-z]{7}-/u, "");
  expect([...inA.keys()].map((id) => local(id)[0]).sort()).toEqual(["c", "g", "g", "i", "s"]);
  expect([...inA.keys()].filter((id) => inB.has(id))).toEqual([]);
  const localA = new Map(
    [...inA].map(([id, markup]) => [local(id), markup.replaceAll(/d[0-9a-z]{7}-/gu, "")]),
  );
  const localB = new Map(
    [...inB].map(([id, markup]) => [local(id), markup.replaceAll(/d[0-9a-z]{7}-/gu, "")]),
  );
  const common = [...localA.keys()].filter((id) => localB.has(id));
  expect(common).toEqual([expect.stringMatching(/^g/u)]);
  const [green] = common;
  expect(localA.get(green ?? "")).toBe(localB.get(green ?? ""));
  expect(localA.get(green ?? "")).toContain("#1a7f37");
});

test("reordering the keys of styles, assets and data changes nothing", () => {
  const base: Design = {
    version: 0,
    canvas: { width: 120, height: 60 },
    styles: {
      a: { fill: "#111111", stroke: "#222222", strokeWidth: 2 },
      b: { fontSize: 18, font: "bold", fill: "#333333" },
    },
    assets: { fonts: { medium: fontAssets.medium, bold: fontAssets.extraBold } },
    layers: [
      { type: "rect", width: 20, height: 20, style: "a" },
      { type: "text", x: 30, content: "{{who}} {{n}}", style: "b", fontWeight: 500 },
    ],
  };
  const reordered: Design = {
    layers: base.layers,
    assets: { fonts: { bold: fontAssets.extraBold, medium: fontAssets.medium } },
    styles: {
      b: { fill: "#333333", font: "bold", fontSize: 18 },
      a: { strokeWidth: 2, stroke: "#222222", fill: "#111111" },
    },
    canvas: { height: 60, width: 120 },
    version: 0,
  };
  const one = renderFixture({ design: base, data: { who: "me", n: 1 } });
  const two = renderFixture({ design: reordered, data: { n: 1, who: "me" } });
  expect(two).toBe(one);
  expect(one).toContain("font-weight:500");
});

test("numbers are printed with at most three decimals and never as -0", () => {
  const result = renderSvg({
    version: 0,
    canvas: { width: 10, height: 10 },
    layers: [{ type: "rect", x: -0, y: 1 / 3, width: 2 / 3, height: 1e-9 + 1, opacity: 0.12345 }],
  });
  expect(result.ok && result.svg).toContain(
    '<rect x="0" y="0.333" width="0.667" height="1" opacity="0.123"/>',
  );
});
