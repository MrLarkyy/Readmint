import { applyDesignProps, type Design, type Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";

const rowsHeight = "{{ 20 + (props.rows | length) * 10 }}";

function rowsDesign(
  layers: readonly Layer[] = [{ type: "component", ref: "card" }],
  canvas: Design["canvas"] = { width: 100, height: rowsHeight },
): Design {
  return {
    version: 0,
    canvas,
    components: {
      card: {
        props: {
          rows: { type: "array", default: [] },
          tone: { type: "color", default: "#112233" },
          size: { type: "number", default: 1 },
        },
        layers: [{ type: "rect", width: 10, height: "{{ props.size }}", fill: "{{ props.tone }}" }],
      },
    },
    layers,
  };
}

function svgOf(design: Design, options: RenderOptions = {}): string {
  const result = renderSvg(design, options);
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}

function issuesOf(design: Design, options: RenderOptions = {}) {
  const result = renderSvg(design, options);
  if (result.ok) throw new Error("expected the render to fail");
  return result.issues;
}

const heightOf = (svg: string) => /^<svg [^>]*\bheight="([^"]*)"/.exec(svg)?.[1];

describe("canvas bindings read the props of the root instance", () => {
  test("the height follows the default and the instance's rows", () => {
    expect(heightOf(svgOf(rowsDesign()))).toBe("20");
    const filled = rowsDesign([
      { type: "component", ref: "card", props: { rows: ["a", "b", "c"] } },
    ]);
    expect(heightOf(svgOf(filled))).toBe("50");
  });

  test("a bound row list from data sizes the canvas too", () => {
    const bound = rowsDesign([{ type: "component", ref: "card", props: { rows: "{{ items }}" } }]);
    expect(heightOf(svgOf(bound, { data: { items: [1, 2] } }))).toBe("40");
  });

  test("equal input gives equal bytes", () => {
    const design = rowsDesign([{ type: "component", ref: "card", props: { rows: ["a"] } }]);
    expect(svgOf(design)).toBe(svgOf(design));
  });

  test("layers of other kinds beside the instance leave it the root", () => {
    const design = rowsDesign([
      { type: "rect", width: 5, height: 5, fill: "#000000" },
      { type: "component", ref: "card", props: { rows: ["a"] } },
    ]);
    expect(heightOf(svgOf(design))).toBe("30");
  });

  test("the instance's props shadow a data key named props", () => {
    const design = rowsDesign([{ type: "component", ref: "card", props: { rows: ["a"] } }]);
    const svg = svgOf(design, { data: { props: { rows: [1, 2, 3, 4, 5] } } });
    expect(heightOf(svg)).toBe("30");
  });

  test("the background binds to a colour prop", () => {
    const design = rowsDesign([{ type: "component", ref: "card", props: { tone: "#abcdef" } }], {
      width: 100,
      height: 20,
      background: "{{ props.tone }}",
    });
    expect(svgOf(design)).toContain('<rect width="100" height="20" fill="#abcdef"/>');
  });

  test("a gradient stop of the background binds to a prop", () => {
    const design = rowsDesign([{ type: "component", ref: "card" }], {
      width: 100,
      height: 20,
      background: {
        type: "linear",
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "{{ props.tone }}" },
        ],
      },
    });
    expect(svgOf(design)).toContain("#112233");
  });

  test("settings written to the root instance resize the canvas", () => {
    const applied = applyDesignProps(rowsDesign(), { rows: ["a", "b"] });
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    expect(heightOf(svgOf(applied.value))).toBe("40");
  });
});

describe("without one root instance the canvas has no props", () => {
  const instance: Layer = { type: "component", ref: "card" };
  const cases: readonly (readonly [string, readonly Layer[]])[] = [
    ["no top-level component", [{ type: "rect", width: 5, height: 5 }]],
    ["two top-level components", [instance, instance]],
    ["a repeated top-level component", [{ ...instance, repeat: { each: "{{ [1] }}" } }]],
    ["a component nested in a group", [{ type: "group", children: [instance] }]],
  ];
  test.each(cases)("%s: an unknown-name issue at /canvas/height", (_name, layers) => {
    const issues = issuesOf(rowsDesign(layers));
    expect(issues).toMatchObject([{ path: "/canvas/height", code: "binding" }]);
    expect(issues[0]?.message).toContain("unknown name props");
  });
});

describe("the root props are resolved once", () => {
  test("a prop of the wrong type is one issue at the prop", () => {
    const design = rowsDesign([{ type: "component", ref: "card", props: { size: "{{ 'big' }}" } }]);
    expect(issuesOf(design)).toMatchObject([{ path: "/layers/0/props/size", code: "type" }]);
  });

  /** The fewest expression steps the render passes with, found by bisection. */
  function stepsNeeded(design: Design, data: Readonly<Record<string, unknown>>): number {
    let low = 0;
    let high = 10_000;
    expect(renderSvg(design, { data, limits: { maxExpressionSteps: high } }).ok).toBe(true);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const ok = renderSvg(design, { data, limits: { maxExpressionSteps: middle } }).ok;
      if (ok) high = middle;
      else low = middle + 1;
    }
    return low;
  }

  test("a canvas reading props costs a literal canvas plus its own expression, nothing more", () => {
    // A prop binding that is costly to evaluate: charged a second time, the props canvas would need more steps.
    const costly = "{{ [1 + 2 * 3, 4 + 5 * 6, 7 + 8 * 9, 1 + 2 * 3, 4 + 5 * 6, 7 + 8 * 9] }}";
    const layers: Layer[] = [{ type: "component", ref: "card", props: { rows: costly } }];
    const data = { other: { size: 1 } };
    const fromProps = stepsNeeded(
      rowsDesign(layers, { width: 100, height: "{{ props.size * 20 }}" }),
      data,
    );
    const literal = stepsNeeded(rowsDesign(layers, { width: 100, height: 20 }), data);
    // The same expression over data of the same shape (`other` is as long a name as `props`), without an instance.
    const expression =
      stepsNeeded(rowsDesign([], { width: 100, height: "{{ other.size * 20 }}" }), data) -
      stepsNeeded(rowsDesign([], { width: 100, height: 20 }), data);
    expect(expression).toBeGreaterThan(0);
    expect(fromProps).toBe(literal + expression);
  });

  test("a literal canvas resolves nothing early: an earlier layer's issue comes first", () => {
    const layers: Layer[] = [
      { type: "rect", width: "{{ 'wide' }}", height: 5 },
      { type: "component", ref: "card", props: { size: "{{ 'big' }}" } },
    ];
    expect(issuesOf(rowsDesign(layers, { width: 100, height: 20 }))).toMatchObject([
      { path: "/layers/0/width" },
    ]);
    expect(issuesOf(rowsDesign(layers))).toMatchObject([{ path: "/layers/1/props/size" }]);
    // A bound canvas that does not name props resolves nothing early either.
    const fromData = rowsDesign(layers, { width: 100, height: "{{ 10 * rows }}" });
    expect(issuesOf(fromData, { data: { rows: 2 } })).toMatchObject([{ path: "/layers/0/width" }]);
  });
});

describe("the root props are resolved early only for a canvas that names props", () => {
  /** A root instance an `if` drops when there is no user, whose `login` prop reads the user. */
  function guarded(canvas: Design["canvas"]): Design {
    return {
      version: 0,
      canvas,
      components: {
        card: {
          props: { login: { type: "string", default: "" }, size: { type: "number", default: 3 } },
          layers: [{ type: "rect", width: "{{ (props.login | length) + 1 }}", height: 1 }],
        },
      },
      layers: [
        {
          type: "component",
          ref: "card",
          if: "{{ user != null }}",
          props: { login: "{{ user.login }}" },
        },
      ],
    };
  }
  const noUser = { data: { user: null, rows: 2, x: { props: 4 }, props_n: 2, "props-x": 3 } };

  test.each([
    "{{ 10 * rows }}",
    "{{ x.props * 10 }}",
    "{{ x.props-1 }}",
    "{{ props_n * 10 }}",
    "{{ props-x * 10 }}",
  ] as const)("%s over a dropped instance renders without checking its props", (height) => {
    expect(renderSvg(guarded({ width: 100, height }), noUser).ok).toBe(true);
  });

  test("a canvas naming props over a dropped instance still resolves and checks them", () => {
    expect(
      issuesOf(guarded({ width: 100, height: "{{ props.size * 10 }}" }), noUser),
    ).toMatchObject([{ path: "/layers/0/props/login", code: "type" }]);
    const svg = svgOf(guarded({ width: 100, height: "{{ props.size * 10 }}" }), {
      data: { user: { login: "octo" } },
    });
    expect(heightOf(svg)).toBe("30");
  });

  test.each([
    "{{ 50-props.size * 10 }}",
    "{{ (props.size) * 10 }}",
    "{{1+props.size*10}}",
  ] as const)("%s names props", (height) => {
    const design = rowsDesign([{ type: "component", ref: "card", props: { size: 2 } }], {
      width: 100,
      height,
    });
    expect(renderSvg(design).ok).toBe(true);
  });
});

describe("a root instance with a let (RM-118)", () => {
  const instance: Layer = {
    type: "component",
    ref: "card",
    let: { n: "{{ seed + 1 }}", list: "{{ [n, n, n] }}" },
    props: { rows: "{{ list }}", size: "{{ n }}" },
  };

  /** Data whose `seed` reads are counted: each evaluation of the let reads it the same number of times. */
  function countingData(): { data: Readonly<Record<string, unknown>>; reads: () => number } {
    let count = 0;
    const data = new Proxy<Record<string, unknown>>(
      { seed: 2 },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === "seed") count++;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    return { data, reads: () => count };
  }

  test("props bound to its let names size the canvas", () => {
    const svg = svgOf(rowsDesign([instance]), { data: { seed: 2 } });
    expect(heightOf(svg)).toBe("50");
    expect(svg).toContain('height="3"');
  });

  test("its let is evaluated once, as when the canvas reads no props", () => {
    const sized = countingData();
    svgOf(rowsDesign([instance]), { data: sized.data });
    const fixed = countingData();
    svgOf(rowsDesign([instance], { width: 100, height: 50 }), { data: fixed.data });
    expect(fixed.reads()).toBeGreaterThan(0);
    expect(sized.reads()).toBe(fixed.reads());
  });

  test("the canvas sees props, not the let names", () => {
    const issues = issuesOf(rowsDesign([instance], { width: 100, height: "{{ n }}" }), {
      data: { seed: 2 },
    });
    expect(issues).toMatchObject([{ path: "/canvas/height", code: "binding" }]);
  });
});
