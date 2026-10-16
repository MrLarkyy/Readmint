import { compileTemplate } from "@readmint/expr";
import { LocalNames, type ComponentDefinition, type Design, type Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

function design(layers: Layer[], extra: Partial<Design> = {}): Design {
  return {
    version: 0,
    canvas: { width: 200, height: 100 },
    assets: { fonts: { m: fontAssets.medium } },
    ...extra,
    layers,
  };
}

function svgOf(input: Design, options: RenderOptions = {}): string {
  const result = renderSvg(input, options);
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}

function issuesOf(input: Design, options: RenderOptions = {}) {
  const result = renderSvg(input, options);
  if (result.ok) throw new Error("expected the render to fail");
  return result.issues;
}

/** True when some layer of the tree, component definitions included, has a `repeat`. */
function hasRepeat(input: Design): boolean {
  const visit = (layers: readonly Layer[]): boolean =>
    layers.some(
      (layer) => layer.repeat !== undefined || (layer.type === "group" && visit(layer.children)),
    );
  return (
    visit(input.layers) ||
    Object.values(input.components ?? {}).some((definition) => visit(definition.layers))
  );
}

const data = { stats: { count: 4, name: "readmint" }, items: [1, 2, 3] };

interface Pair {
  readonly withLet: Design;
  readonly twin: Design;
  /** The let design repeats nothing itself: the twin is its one-item-repeat form. */
  readonly letOnly: boolean;
}

const card = (layers: Layer[]): ComponentDefinition => ({
  props: { size: { type: "number", default: 1 } },
  layers,
});

const pairs: Readonly<Record<string, Pair>> = {
  "a group let read by its children": {
    letOnly: true,
    withLet: design([
      {
        type: "group",
        let: { n: "{{ stats.count * 2 }}" },
        children: [
          {
            type: "rect",
            x: "{{ n }}",
            width: 10,
            height: 10,
            fill: "{{ n > 3 ? '#ff0000' : '#00ff00' }}",
          },
          { type: "text", y: 20, content: "{{ n }} stars", font: "m" },
        ],
      },
    ]),
    twin: design([
      {
        type: "group",
        repeat: { each: "{{ [stats.count * 2] }}", as: "n" },
        children: [
          {
            type: "rect",
            x: "{{ n }}",
            width: 10,
            height: 10,
            fill: "{{ n > 3 ? '#ff0000' : '#00ff00' }}",
          },
          { type: "text", y: 20, content: "{{ n }} stars", font: "m" },
        ],
      },
    ]),
  },
  "three chained entries": {
    letOnly: true,
    withLet: design([
      {
        type: "rect",
        let: { a: "{{ stats.count }}", b: "{{ a + 1 }}", c: "{{ b * 2 }}" },
        x: "{{ a }}",
        y: "{{ b }}",
        width: "{{ c }}",
        height: 5,
      },
    ]),
    twin: design([
      {
        type: "rect",
        repeat: { each: "{{ [[stats.count, stats.count + 1, (stats.count + 1) * 2]] }}", as: "v" },
        x: "{{ v[0] }}",
        y: "{{ v[1] }}",
        width: "{{ v[2] }}",
        height: 5,
      },
    ]),
  },
  "a let read by the same layer's if, visible and x": {
    letOnly: true,
    withLet: design([
      {
        type: "rect",
        let: { n: "{{ stats.count }}" },
        if: "{{ n > 1 }}",
        visible: "{{ n < 10 }}",
        x: "{{ n }}",
        width: 3,
        height: 3,
      },
      { type: "rect", let: { n: "{{ 0 }}" }, if: "{{ n > 1 }}", width: 3, height: 3 },
    ]),
    twin: design([
      {
        type: "rect",
        repeat: { each: "{{ [stats.count] }}", as: "n" },
        if: "{{ n > 1 }}",
        visible: "{{ n < 10 }}",
        x: "{{ n }}",
        width: 3,
        height: 3,
      },
      {
        type: "rect",
        repeat: { each: "{{ [0] }}", as: "n" },
        if: "{{ n > 1 }}",
        width: 3,
        height: 3,
      },
    ]),
  },
  "nested lets": {
    letOnly: true,
    withLet: design([
      {
        type: "group",
        let: { a: "{{ stats.count }}" },
        children: [
          {
            type: "group",
            let: { b: "{{ a * 2 }}" },
            x: "{{ a }}",
            children: [{ type: "rect", width: "{{ b }}", height: "{{ a }}" }],
          },
        ],
      },
    ]),
    twin: design([
      {
        type: "group",
        repeat: { each: "{{ [stats.count] }}", as: "a" },
        children: [
          {
            type: "group",
            repeat: { each: "{{ [a * 2] }}", as: "b" },
            x: "{{ a }}",
            children: [{ type: "rect", width: "{{ b }}", height: "{{ a }}" }],
          },
        ],
      },
    ]),
  },
  "a let under a repeat reading the item": {
    letOnly: false,
    withLet: design([
      {
        type: "rect",
        repeat: { each: "{{ items }}" },
        let: { w: "{{ item * 3 + index }}" },
        x: "{{ w }}",
        width: "{{ w }}",
        height: 2,
      },
    ]),
    twin: design([
      {
        type: "rect",
        repeat: { each: "{{ items }}" },
        x: "{{ item * 3 + index }}",
        width: "{{ item * 3 + index }}",
        height: 2,
      },
    ]),
  },
  "a let in a component definition reading props": {
    letOnly: true,
    withLet: design([{ type: "component", ref: "card", props: { size: "{{ stats.count }}" } }], {
      components: {
        card: card([
          { type: "rect", let: { w: "{{ props.size * 2 }}" }, width: "{{ w }}", height: 4 },
        ]),
      },
    }),
    twin: design([{ type: "component", ref: "card", props: { size: "{{ stats.count }}" } }], {
      components: {
        card: card([
          {
            type: "rect",
            repeat: { each: "{{ [props.size * 2] }}", as: "w" },
            width: "{{ w }}",
            height: 4,
          },
        ]),
      },
    }),
  },
  "a let on an instance feeding props and read inside the definition": {
    letOnly: true,
    withLet: design(
      [
        {
          type: "component",
          ref: "card",
          let: { n: "{{ stats.count + 1 }}" },
          props: { size: "{{ n }}" },
        },
      ],
      {
        components: {
          card: card([{ type: "rect", width: "{{ props.size }}", height: "{{ n }}" }]),
        },
      },
    ),
    twin: design(
      [
        {
          type: "component",
          ref: "card",
          repeat: { each: "{{ [stats.count + 1] }}", as: "n" },
          props: { size: "{{ n }}" },
        },
      ],
      {
        components: {
          card: card([{ type: "rect", width: "{{ props.size }}", height: "{{ n }}" }]),
        },
      },
    ),
  },
  "an animated layer with a stagger under a repeat and a let": {
    letOnly: false,
    withLet: design(
      [
        {
          type: "rect",
          repeat: { each: "{{ items }}" },
          let: { d: "{{ item * 10 }}" },
          x: "{{ d }}",
          width: 5,
          height: 5,
          animate: {
            opacity: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: "{{ d / 30 }}" },
              ],
              stagger: 100,
            },
          },
        },
      ],
      { animation: { duration: 1000 } },
    ),
    twin: design(
      [
        {
          type: "rect",
          repeat: { each: "{{ items }}" },
          x: "{{ item * 10 }}",
          width: 5,
          height: 5,
          animate: {
            opacity: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: "{{ item * 10 / 30 }}" },
              ],
              stagger: 100,
            },
          },
        },
      ],
      { animation: { duration: 1000 } },
    ),
  },
  "a text binding as a value": {
    letOnly: true,
    withLet: design([
      {
        type: "text",
        let: { label: "{{ stats.name }}: {{ stats.count }}" },
        content: "{{ label }}",
        font: "m",
      },
    ]),
    twin: design([
      {
        type: "text",
        repeat: { each: "{{ [stats.name] }}", as: "label" },
        content: "{{ label }}: {{ stats.count }}",
        font: "m",
      },
    ]),
  },
};

describe("a let renders the same bytes as its twin without one", () => {
  test.each(Object.entries(pairs))("%s", (_name, { withLet, twin, letOnly }) => {
    expect(withLet).not.toEqual(twin);
    if (letOnly) expect(hasRepeat(withLet)).toBe(false);
    const svg = svgOf(withLet, { data });
    expect(svg).toBe(svgOf(twin, { data }));
    expect(svgOf(withLet, { data })).toBe(svg);
  });
});

describe("let errors are located at the entry", () => {
  const rect = (bindings: Record<string, string>): Layer =>
    ({ type: "rect", width: 1, height: 1, let: bindings }) as Layer;

  test("a forward reference fails before evaluating, even with a data key of that name", () => {
    const issues = issuesOf(design([rect({ a: "{{ b }}", b: "{{ 1 }}" })]), { data: { b: 5 } });
    expect(issues).toEqual([
      {
        path: "/layers/0/let/a",
        code: "binding",
        message: 'let "a" reads "b", which is bound later in this let',
      },
    ]);
  });

  test("a self reference is located at the entry", () => {
    expect(issuesOf(design([rect({ a: "{{ a + 1 }}" })]))).toEqual([
      {
        path: "/layers/0/let/a",
        code: "binding",
        message: 'let "a" reads "a", which is the entry itself',
      },
    ]);
  });

  test("the first bad entry wins", () => {
    const issues = issuesOf(design([rect({ a: "{{ 1 }}", b: "{{ c }}", c: "{{ b }}" })]));
    expect(issues).toMatchObject([{ path: "/layers/0/let/b", code: "binding" }]);
  });

  test("an unknown name in an entry is a binding issue at the entry", () => {
    const issues = issuesOf(design([rect({ a: "{{ 1 }}", b: "{{ nope + a }}" })]));
    expect(issues).toMatchObject([{ path: "/layers/0/let/b", code: "binding" }]);
    expect(issues[0]?.message).toContain("unknown name nope");
  });

  test("a syntax error in an entry is located at the entry", () => {
    expect(issuesOf(design([rect({ a: "{{ 1 + }}" })]))).toMatchObject([
      { path: "/layers/0/let/a", code: "binding" },
    ]);
  });

  test("a name hiding a top-level data key fails at the entry", () => {
    const issues = issuesOf(design([rect({ github: "{{ 1 }}" })]), { data: { github: {} } });
    expect(issues).toEqual([
      {
        path: "/layers/0/let/github",
        code: "binding",
        message: 'let "github" hides the data name "github"',
      },
    ]);
  });

  test("an entry that is not a binding is a type issue (an unvalidated design)", () => {
    const layer = { type: "rect", width: 1, height: 1, let: { a: 3 } } as unknown as Layer;
    expect(issuesOf(design([layer]))).toMatchObject([{ path: "/layers/0/let/a", code: "type" }]);
  });

  test("an error under a repeat names the copy", () => {
    const layer = { ...rect({ a: "{{ item.x.y + 1 }}" }), repeat: { each: "{{ [1] }}" } } as Layer;
    const issues = issuesOf(design([layer]));
    expect(issues).toMatchObject([{ path: "/layers/0/let/a", code: "binding" }]);
    expect(issues[0]?.message).toContain("repeat item 0");
  });

  test("more than maxLocals locals in one scope fail at the let", () => {
    const entries = (prefix: string, count: number) =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`${prefix}${String(i)}`, "{{ 1 }}"]),
      );
    expect(issuesOf(design([rect(entries("n", 257))]))).toMatchObject([
      { path: "/layers/0/let", code: "binding" },
    ]);
    let layer: Layer = rect(entries("e", 64));
    for (let level = 3; level >= 0; level--) {
      layer = { type: "group", let: entries(`l${String(level)}_`, 64), children: [layer] } as Layer;
    }
    const issues = issuesOf(design([layer]));
    expect(issues).toMatchObject([
      { path: "/layers/0/children/0/children/0/children/0/children/0/let", code: "binding" },
    ]);
    expect(issues[0]?.message).toContain("at most 256 locals, this one would hold 320");
    expect(issues[0]?.message).toContain("(too-large)");
  });

  test("__proto__ and constructor are plain let names", () => {
    const layer = rect({ ["__proto__"]: "{{ 7 }}", constructor: "{{ __proto__ + 1 }}" });
    const svg = svgOf(design([{ ...layer, x: "{{ constructor }}" }]));
    expect(svg).toContain('x="8"');
    expect(Object.hasOwn(Object.prototype, "7")).toBe(false);
  });

  test("an entry evaluated before a false if still fails: the guard goes on the parent", () => {
    const layer = { ...rect({ a: "{{ nope + 1 }}" }), if: "{{ false }}" } as Layer;
    expect(issuesOf(design([layer]))).toMatchObject([{ path: "/layers/0/let/a" }]);
    const guarded = design([{ type: "group", if: "{{ false }}", children: [layer] }]);
    expect(svgOf(guarded)).not.toContain("<rect");
  });
});

describe("the let name grammar is the expression name grammar", () => {
  const pattern = new RegExp(LocalNames.pattern, "u");
  const reserved = new Set<string>(LocalNames.reserved);
  const corpus = [
    "a",
    "_",
    "_a",
    "a1",
    "A_b",
    "my-label",
    "a-b-c",
    "a-_b",
    "x-1",
    "a-",
    "-a",
    "1a",
    "a b",
    "a.b",
    "a--b",
    "é",
    "aé",
    "",
    "true",
    "false",
    "null",
    "props",
    "constructor",
    "__proto__",
    "a$",
    "a[0]",
  ];

  /** Whether an expression reads `text` as exactly one name. */
  function readsAsName(text: string): boolean {
    const template = compileTemplate(`{{ ${text} }}`);
    if (!template.ok) return false;
    return template.value.names.size === 1 && template.value.names.has(text);
  }

  test.each(corpus)("%j", (name) => {
    if (reserved.has(name)) {
      expect(["props"].includes(name) ? readsAsName(name) : !readsAsName(name)).toBe(true);
      return;
    }
    expect(pattern.test(name) && name.length <= LocalNames.maxLength).toBe(readsAsName(name));
  });
});
