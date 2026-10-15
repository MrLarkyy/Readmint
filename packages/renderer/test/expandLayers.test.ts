import type { ComponentDefinition, Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderResult } from "../src/index.js";

function render(
  layers: Layer[],
  data?: Readonly<Record<string, unknown>>,
  components?: Design["components"],
): RenderResult {
  return renderSvg(
    {
      version: 0,
      canvas: { width: 200, height: 200 },
      layers,
      ...(components ? { components } : {}),
    },
    { data: data ?? {} },
  );
}

function rects(result: RenderResult): string[] {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg.match(/<rect [^>]*\/>/gu) ?? [];
}

describe("repeat", () => {
  test("defaults expose item and index", () => {
    const result = render(
      [
        {
          type: "rect",
          x: "{{index}}",
          width: "{{item}}",
          height: 1,
          repeat: { each: "{{list}}" },
        },
      ],
      { list: [5, 6, 7] },
    );
    expect(rects(result)).toEqual([
      '<rect x="0" y="0" width="5" height="1"/>',
      '<rect x="1" y="0" width="6" height="1"/>',
      '<rect x="2" y="0" width="7" height="1"/>',
    ]);
  });

  test("as and index rename the locals, and if filters copies", () => {
    const result = render(
      [
        {
          type: "rect",
          x: "{{i}}",
          width: "{{bar.w}}",
          height: 1,
          if: "{{bar.on}}",
          repeat: { each: "{{bars}}", as: "bar", index: "i" },
        },
      ],
      {
        bars: [
          { w: 3, on: true },
          { w: 4, on: false },
          { w: 5, on: true },
        ],
      },
    );
    expect(rects(result)).toEqual([
      '<rect x="0" y="0" width="3" height="1"/>',
      '<rect x="2" y="0" width="5" height="1"/>',
    ]);
  });

  test("each must give a list; null (missing data) repeats nothing", () => {
    expect(
      render([{ type: "rect", width: 1, height: 1, repeat: { each: "{{n}}" } }], { n: 3 }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/repeat/each", code: "binding" }],
    });
    const none = render(
      [
        { type: "rect", width: 1, height: 1, repeat: { each: "{{user.repos}}" } },
        { type: "rect", width: 2, height: 1 },
      ],
      { user: null },
    );
    expect(rects(none)).toEqual(['<rect x="0" y="0" width="2" height="1"/>']);
  });

  test("more than 10000 items is refused before any copy is built", () => {
    const result = render([{ type: "rect", width: 1, height: 1, repeat: { each: "{{list}}" } }], {
      list: new Array<number>(10_001).fill(1),
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/repeat/each", code: "binding" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain("(too-large)");
  });

  test.each([
    ["a name an expression cannot read", { each: "{{list}}", as: "repo-1" }],
    ["the same name twice", { each: "{{list}}", as: "a", index: "a" }],
  ] as const)("%s is an issue at the repeat", (_name, repeat) => {
    expect(render([{ type: "rect", width: 1, height: 1, repeat }], { list: [1] })).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/repeat", code: "binding" }],
    });
  });

  test("an issue in a copy names the item", () => {
    const result = render(
      [{ type: "rect", width: "{{item}}", height: 1, repeat: { each: "{{list}}" } }],
      { list: [1, -1] },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/width", code: "range" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain("(repeat item 1)");
  });

  test("data keys named like prototype members are plain values", () => {
    const result = render(
      [{ type: "rect", width: "{{constructor}}", height: 1 }],
      JSON.parse('{"constructor": 9}') as Record<string, unknown>,
    );
    expect(rects(result)).toEqual(['<rect x="0" y="0" width="9" height="1"/>']);
    expect(render([{ type: "rect", width: "{{toString}}", height: 1 }], {})).toMatchObject({
      ok: false,
      issues: [{ code: "binding" }],
    });
  });
});

describe("components", () => {
  const inner: ComponentDefinition = {
    props: { size: { type: "number", default: 4 } },
    layers: [{ type: "rect", width: "{{props.size}}", height: "{{props.size}}" }],
  };
  const outer: ComponentDefinition = {
    props: { size: { type: "number", default: 10 }, colour: { type: "color", default: "#000" } },
    layers: [
      { type: "rect", width: "{{props.size}}", height: 1, fill: "{{props.colour}}" },
      { type: "component", ref: "inner", y: 5, props: { size: "{{props.size}}" } },
      { type: "component", ref: "inner", y: 20 },
    ],
  };

  test("props: defaults, overrides, bindings and nested scope", () => {
    const result = render(
      [{ type: "component", ref: "outer", props: { size: "{{n}}" } }],
      { n: 7 },
      { inner, outer },
    );
    expect(rects(result)).toEqual([
      '<rect x="0" y="0" width="7" height="1" fill="#000000"/>',
      '<rect x="0" y="0" width="7" height="7"/>',
      '<rect x="0" y="0" width="4" height="4"/>',
    ]);
  });

  const days: ComponentDefinition = {
    props: { days: { type: "array", default: [3, 4] } },
    layers: [
      {
        type: "rect",
        x: "{{index}}",
        width: "{{item}}",
        height: 1,
        repeat: { each: "{{props.days}}" },
      },
    ],
  };
  const mode: ComponentDefinition = {
    props: { mode: { type: "enum", values: ["horizontal", "vertical"], default: "horizontal" } },
    layers: [{ type: "rect", width: 1, height: 1 }],
  };

  test("an array prop bound to data is iterated by a repeat, byte-equal across renders", () => {
    const layers: Layer[] = [{ type: "component", ref: "days", props: { days: "{{list}}" } }];
    const first = render(layers, { list: [5, 6] }, { days });
    expect(rects(first)).toEqual([
      '<rect x="0" y="0" width="5" height="1"/>',
      '<rect x="1" y="0" width="6" height="1"/>',
    ]);
    expect(render(layers, { list: [5, 6] }, { days })).toEqual(first);
  });

  test("a default list is iterated", () => {
    expect(rects(render([{ type: "component", ref: "days" }], {}, { days }))).toHaveLength(2);
  });

  test("an array prop bound to a number is a type issue", () => {
    const result = render(
      [{ type: "component", ref: "days", props: { days: "{{n}}" } }],
      { n: 3 },
      { days },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/props/days", code: "type" }],
    });
  });

  test("an enum prop bound to an unlisted value names the values", () => {
    const result = render(
      [{ type: "component", ref: "mode", props: { mode: "{{o}}" } }],
      { o: "diagonal" },
      { mode },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          path: "/layers/0/props/mode",
          code: "type",
          message: expect.stringContaining('"vertical"') as string,
        },
      ],
    });
  });

  test("an enum prop bound to a listed value renders", () => {
    const result = render(
      [{ type: "component", ref: "mode", props: { mode: "{{o}}" } }],
      { o: "vertical" },
      { mode },
    );
    expect(rects(result)).toHaveLength(1);
  });

  test("an unvalidated enum definition without values is a type issue, never a throw", () => {
    const broken = {
      props: { mode: { type: "enum" } },
      layers: [],
    } as unknown as ComponentDefinition;
    const result = render(
      [{ type: "component", ref: "mode", props: { mode: "{{o}}" } }],
      { o: "x" },
      { mode: broken },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/props/mode", code: "type" }],
    });
  });

  test("a repeat over an array prop counts against maxRepeatCopies", () => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        layers: [{ type: "component", ref: "days", props: { days: "{{list}}" } }],
        components: { days },
      },
      { data: { list: [1, 2, 3, 4] }, limits: { maxRepeatCopies: 3 } },
    );
    expect(result.ok).toBe(false);
  });

  test("a bound prop of the wrong type is an issue at the instance prop", () => {
    const result = render(
      [{ type: "component", ref: "outer", props: { colour: "{{c}}" } }],
      { c: "blue" },
      { inner, outer },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/props/colour", code: "type" }],
    });
  });

  test("an issue inside a component points into the definition and names the instance", () => {
    const result = render(
      [
        { type: "rect", width: 1, height: 1 },
        { type: "component", ref: "outer", props: { size: "{{n}}" } },
      ],
      { n: 0 },
      { inner, outer },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/components/outer/layers/0/width", code: "range" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain(
      "(in component instance /layers/1)",
    );
  });

  test("a component that contains itself stops at the nesting bound", () => {
    const loop: ComponentDefinition = { layers: [{ type: "component", ref: "loop" }] };
    expect(render([{ type: "component", ref: "loop" }], {}, { loop })).toMatchObject({
      ok: false,
      issues: [{ code: "too-large" }],
    });
  });
});

describe("visibility", () => {
  test("visible false and a falsy if drop the layer, ids and names are not emitted", () => {
    const result = render(
      [
        { type: "rect", id: "keep", name: "Kept", width: 1, height: 1 },
        { type: "rect", width: 2, height: 1, visible: false },
        { type: "rect", width: 3, height: 1, if: "{{missing}}" },
        { type: "rect", width: 5, height: 1, if: "{{empty}}" },
        { type: "rect", width: 4, height: 1, if: "{{yes}}" },
      ],
      { yes: 1, missing: null, empty: [] },
    );
    expect(rects(result)).toEqual([
      '<rect x="0" y="0" width="1" height="1"/>',
      '<rect x="0" y="0" width="4" height="1"/>',
    ]);
    expect(result.ok && result.svg).not.toMatch(/keep|Kept/u);
  });
});
