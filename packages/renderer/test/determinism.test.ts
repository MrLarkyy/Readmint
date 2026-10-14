import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { renderFixture } from "./renderFixture.js";
import layout from "./renderer-layout.golden.js";
import shapes from "./renderer-shapes.golden.js";
import text from "./renderer-text.golden.js";
import { fontAssets } from "./testAssets.js";

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

test("ids restart with every render", () => {
  const svg = renderFixture(input(shapes, "rect-linear-gradient"));
  expect(svg).toContain('id="g0"');
  expect(renderFixture(input(shapes, "ellipse-radial-gradient"))).toContain('id="g0"');
  const clip = renderFixture(input(layout, "group-clip"));
  expect(clip).toContain('id="c0"');
  expect(clip).not.toContain('id="c1"');
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
