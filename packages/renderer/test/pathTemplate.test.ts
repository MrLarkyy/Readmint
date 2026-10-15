import type { Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderResult } from "../src/index.js";

function render(layers: Layer[], data: Readonly<Record<string, unknown>> = {}): RenderResult {
  const design: Design = {
    version: 0,
    canvas: { width: 200, height: 100 },
    animation: { duration: 1000 },
    layers,
  };
  return renderSvg(design, { data });
}

function svgOf(result: RenderResult): string {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

const draw = {
  draw: {
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 1, value: 1 },
    ],
  },
};

describe("a path d template", () => {
  test("each repeat copy writes its own data and lays out by its own bounds", () => {
    const svg = svgOf(
      render(
        [
          {
            type: "group",
            layout: { type: "stack", direction: "row", gap: 2 },
            children: [
              {
                type: "path",
                d: "M0 0 h{{ item }} v{{ item }} Z",
                fill: "#2ea043",
                repeat: { each: "{{ sizes }}" },
              },
            ],
          },
        ],
        { sizes: [10, 30, 5] },
      ),
    );
    expect(svg.match(/<path d="[^"]*"/gu)).toEqual([
      '<path d="M0 0 h10 v10 Z"',
      '<path d="M0 0 h30 v30 Z"',
      '<path d="M0 0 h5 v5 Z"',
    ]);
    // Placed by the stack after widths 10 and 30: a shared bounds cache would put every copy 12 apart.
    expect(svg.match(/translate\([0-9.]+ 0\)/gu)).toEqual(["translate(12 0)", "translate(44 0)"]);
  });

  test("a draw track measures each copy's own data", () => {
    const svg = svgOf(
      render([
        {
          type: "path",
          d: "M0 0 h{{ item }}",
          stroke: "#000",
          repeat: { each: "{{ [10, 50] }}" },
          animate: draw,
        },
      ]),
    );
    expect(svg).toContain('stroke-dasharray="11.1 11.1"');
    expect(svg).toContain('stroke-dasharray="51.5 51.5"');
  });

  test("a literal d keeps sharing its bounds per layer", () => {
    const literal = render([
      { type: "path", d: "M0 0 h10 v10 Z", fill: "#000", repeat: { each: "{{ [1, 2] }}" } },
    ]);
    expect(svgOf(literal).match(/<path d="M0 0 h10 v10 Z"/gu)).toHaveLength(2);
  });

  test.each([
    ["markup", '{{ "\\"/><script>" }}'],
    ["a letter outside path data", "M0 0 {{ 'x' }}"],
    ["nothing", "{{ null }}"],
  ])("an evaluated d with %s fails range at d and writes nothing", (_name, d) => {
    const result = render([{ type: "path", d, fill: "#000" }]);
    expect(result).toMatchObject({ ok: false, issues: [{ path: "/layers/0/d", code: "range" }] });
    expect(result.ok ? "" : result.issues[0]?.message).not.toContain("script");
    expect("svg" in result).toBe(false);
  });

  test("an evaluated d longer than any string an expression may give fails", () => {
    const result = render([{ type: "path", d: "M0 0{{ steps }}{{ steps }}", fill: "#000" }], {
      steps: " l1 1".repeat(15_000),
    });
    expect(result).toMatchObject({ ok: false, issues: [{ path: "/layers/0/d" }] });
  });

  test("an evaluated arc under a draw track fails range at the track", () => {
    const result = render([
      { type: "path", d: "M0 5 {{ 'A' }}5 5 0 1 1 10 5", stroke: "#000", animate: draw },
    ]);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/draw", code: "range" }],
    });
  });

  test("the same design and data render the same bytes", () => {
    const layers: Layer[] = [
      {
        type: "path",
        d: "M0 {{ 40 - item * 1.25 | round(2) }} h6 V40 h-6 Z",
        x: "{{ index * 8 }}",
        fill: "#0969da",
        repeat: { each: "{{ [3, 7.3, 11, 0.4] }}" },
      },
    ];
    expect(svgOf(render(layers))).toBe(svgOf(render(layers)));
  });
});
