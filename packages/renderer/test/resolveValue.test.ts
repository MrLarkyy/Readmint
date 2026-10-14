import type { Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderIssue } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

function issueOf(
  layer: Layer,
  data: Readonly<Record<string, unknown>>,
  extra: Partial<Design> = {},
): RenderIssue | undefined {
  const result = renderSvg(
    { version: 0, canvas: { width: 100, height: 100 }, layers: [layer], ...extra },
    { data },
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
    // NaN and Infinity are not JSON: expr refuses them where they are read (invalid-data).
    [
      "NaN",
      { type: "rect", x: "{{v}}", width: 1, height: 1 },
      Number.NaN,
      "/layers/0/x",
      "binding",
    ],
    [
      "infinite",
      { type: "rect", y: "{{v}}", width: 1, height: 1 },
      Infinity,
      "/layers/0/y",
      "binding",
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
      { data: { w: 4097 } },
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
      { data: { w: 40, bg: "none", c: "#12345678", on: true } },
    );
    expect(result.ok && result.svg).toContain(
      '<rect x="0" y="0" width="40" height="5" fill="#123456" fill-opacity="0.471"/>',
    );
  });
});

describe("expressions (@readmint/expr)", () => {
  const font = { f: fontAssets.medium };
  const render = (layers: Layer[], data: Readonly<Record<string, unknown>> = {}) =>
    renderSvg(
      { version: 0, canvas: { width: 100, height: 40 }, assets: { fonts: font }, layers },
      { data },
    );

  test.each([
    ["syntax", "{{ 1 + }}", {}, "syntax"],
    ["unknown name", "{{ nope }}", {}, "unknown-name"],
    ["not finite", "{{ w / 0 }}", { w: 5 }, "not-finite"],
    ["data that is not JSON", "{{ w }}", { w: Number.NaN }, "invalid-data"],
  ])("%s is a binding issue at the property", (_name, binding, data, code) => {
    const result = render([{ type: "rect", width: binding as `{{${string}}}`, height: 1 }], data);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/width", code: "binding" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain(`(${code})`);
  });

  test("an issue message never carries a value read from the data", () => {
    const token = "ghp_secretTOKEN1234567890";
    const result = render([{ type: "rect", width: "{{ secret + 1 }}", height: 1 }], {
      secret: token,
    });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "binding" }] });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  test("a text that is one placeholder is written as text with expr's rules", () => {
    const result = render(
      [
        { type: "text", content: "{{ stars }}", font: "f" },
        { type: "text", content: "{{ missing.name }}|{{ yes }}|{{ -0 }}", font: "f" },
      ],
      { stars: 1234, yes: true, missing: null },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const lines = [...result.svg.matchAll(/<tspan [^>]*>([^<]*)<\/tspan>/gu)].map(
      (match) => match[1],
    );
    expect(lines).toEqual(["1234", "|true|0"]);
  });

  test("a list or an object has no text form", () => {
    expect(
      render([{ type: "text", content: "{{ list }}", font: "f" }], { list: [1] }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/content", code: "type" }],
    });
    expect(
      render([{ type: "text", content: "a {{ list }}", font: "f" }], { list: [1] }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/content", code: "binding" }],
    });
  });

  test("the locale option reaches the number filters", () => {
    const text = (locale?: string) => {
      const result = renderSvg(
        {
          version: 0,
          canvas: { width: 100, height: 40 },
          assets: { fonts: font },
          layers: [{ type: "text", content: "{{ n | number(1) }}", font: "f" }],
        },
        { data: { n: 1234.5 }, ...(locale === undefined ? {} : { locale }) },
      );
      return result.ok ? /<tspan [^>]*>([^<]*)</u.exec(result.svg)?.[1] : result.issues;
    };
    expect(text()).toBe("1,234.5");
    expect(text("de")).toBe("1.234,5");
  });

  test("an interpolated text over the length limit is too large", () => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
        layers: [{ type: "text", content: "{{long}}", font: "f" }],
      },
      { data: { long: "a".repeat(10_001) } },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/content", code: "too-large" }],
    });
  });
});
