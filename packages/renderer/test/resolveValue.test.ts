import type { Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type ExpressionEvaluator, type RenderIssue } from "../src/index.js";
import { testEvaluator } from "./testEvaluator.js";

function issueOf(
  layer: Layer,
  data: unknown,
  extra: Partial<Design> = {},
): RenderIssue | undefined {
  const result = renderSvg(
    { version: 0, canvas: { width: 100, height: 100 }, layers: [layer], ...extra },
    { data, expressions: testEvaluator },
  );
  return result.ok ? undefined : result.issues[0];
}

describe("bound values are checked against the format ranges", () => {
  test.each([
    [
      "out of range",
      { type: "rect", width: "{{v}}", height: 1 },
      100_001,
      "/layers/0/width",
      "range",
    ],
    ["zero size", { type: "rect", width: "{{v}}", height: 1 }, 0, "/layers/0/width", "range"],
    ["NaN", { type: "rect", x: "{{v}}", width: 1, height: 1 }, Number.NaN, "/layers/0/x", "type"],
    [
      "infinite",
      { type: "rect", y: "{{v}}", width: 1, height: 1 },
      Infinity,
      "/layers/0/y",
      "type",
    ],
    ["string", { type: "rect", width: 1, height: "{{v}}" }, "12", "/layers/0/height", "type"],
    [
      "opacity",
      { type: "rect", width: 1, height: 1, opacity: "{{v}}" },
      1.5,
      "/layers/0/opacity",
      "range",
    ],
    [
      "rotation",
      { type: "rect", width: 1, height: 1, rotation: "{{v}}" },
      400,
      "/layers/0/rotation",
      "range",
    ],
    [
      "bad colour",
      { type: "rect", width: 1, height: 1, fill: "{{v}}" },
      "red",
      "/layers/0/fill",
      "type",
    ],
    [
      "colour object",
      { type: "rect", width: 1, height: 1, stroke: "{{v}}" },
      { r: 1 },
      "/layers/0/stroke",
      "type",
    ],
    [
      "boolean",
      { type: "rect", width: 1, height: 1, visible: "{{v}}" },
      "yes",
      "/layers/0/visible",
      "type",
    ],
    [
      "gradient stop",
      {
        type: "rect",
        width: 1,
        height: 1,
        fill: {
          type: "linear",
          stops: [
            { offset: 0, color: "#000" },
            { offset: "{{v}}", color: "#fff" },
          ],
        },
      },
      2,
      "/layers/0/fill/stops/1/offset",
      "range",
    ],
    [
      "grid columns",
      { type: "group", layout: { type: "grid", columns: "{{v}}" }, children: [] },
      2.5,
      "/layers/0/layout/columns",
      "type",
    ],
    [
      "font weight",
      { type: "text", content: "x", font: "f", fontWeight: "{{v}}" },
      1001,
      "/layers/0/fontWeight",
      "range",
    ],
  ] as const)("%s", (_name, layer, value, path, code) => {
    const issue = issueOf(
      layer,
      { v: value },
      {
        assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
      },
    );
    expect(issue).toMatchObject({ path, code });
  });

  test("a style value points into the style", () => {
    const issue = issueOf(
      { type: "rect", width: 1, height: 1, style: "s" },
      { w: -1 },
      { styles: { s: { strokeWidth: "{{w}}" } } },
    );
    expect(issue).toMatchObject({ path: "/styles/s/strokeWidth", code: "range" });
  });

  test("the canvas size is an integer up to 4096", () => {
    const result = renderSvg(
      { version: 0, canvas: { width: "{{w}}", height: 10 }, layers: [] },
      { data: { w: 4097 }, expressions: testEvaluator },
    );
    expect(result).toMatchObject({ ok: false, issues: [{ path: "/canvas/width", code: "range" }] });
  });

  test("valid bound values render", () => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: "{{w}}", height: 10, background: "{{bg}}" },
        layers: [{ type: "rect", width: "{{w}}", height: 5, fill: "{{c}}", visible: "{{on}}" }],
      },
      { data: { w: 40, bg: "none", c: "#12345678", on: true }, expressions: testEvaluator },
    );
    expect(result.ok && result.svg).toContain(
      '<rect x="0" y="0" width="40" height="5" fill="#123456" fill-opacity="0.471"/>',
    );
  });
});

describe("evaluator problems", () => {
  test("a throwing evaluator gives a binding issue with a capped message", () => {
    const throwing: ExpressionEvaluator = {
      evaluate: () => {
        throw new Error(`bad ${"x".repeat(500)}`);
      },
      interpolate: () => "",
    };
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        layers: [{ type: "rect", width: "{{w}}", height: 1 }],
      },
      { expressions: throwing },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/width", code: "binding" }],
    });
    const message = result.ok ? "" : (result.issues[0]?.message ?? "");
    expect(message).toContain('"{{w}}" failed: bad xxx');
    expect(message.length).toBeLessThan(300);
  });

  test("a throwing interpolation is a binding issue at the content", () => {
    const throwing: ExpressionEvaluator = {
      evaluate: () => 1,
      interpolate: () => {
        throw new Error("no such value");
      },
    };
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
        layers: [{ type: "text", content: "{{x}}", font: "f" }],
      },
      { expressions: throwing },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [
        { path: "/layers/0/content", code: "binding", message: '"{{x}}" failed: no such value' },
      ],
    });
  });

  test("no evaluator: a binding or a placeholder is a no-evaluator issue", () => {
    const binding = renderSvg({
      version: 0,
      canvas: { width: 10, height: 10 },
      layers: [{ type: "rect", width: 1, height: 1, if: "{{show}}" }],
    });
    expect(binding).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/if", code: "no-evaluator" }],
    });
    const text = renderSvg({
      version: 0,
      canvas: { width: 10, height: 10 },
      assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
      layers: [{ type: "text", content: "hi {{name}}", font: "f" }],
    });
    expect(text).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/content", code: "no-evaluator" }],
    });
  });

  test("an interpolated text over the length limit is too large", () => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
        layers: [{ type: "text", content: "{{long}}", font: "f" }],
      },
      { data: { long: "a".repeat(10_001) }, expressions: testEvaluator },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/content", code: "too-large" }],
    });
  });
});
