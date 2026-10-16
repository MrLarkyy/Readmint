import type { Binding, ComponentDefinition, Design, Layer, Palette } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

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

const colours = {
  bg: ["#ffffff", "#0d1117"],
  ink: ["#1f2328", "#e6edf3"],
  accent: ["#0969da", "#2f81f7"],
  soft: ["#ddf4ff80", "#388bfd26"],
} as const;

type Token = keyof typeof colours;

const palette: Palette = {
  light: Object.fromEntries(Object.entries(colours).map(([token, [light]]) => [token, light])),
  dark: Object.fromEntries(Object.entries(colours).map(([token, [, dark]]) => [token, dark])),
};

/** How a design names the colour of a token: through the palette, or as the ternary it replaces. */
type Read = (token: Token) => string;

const viaPalette: Read = (token) => `palette.${token}`;
const viaTernary: Read = (token) =>
  `(props.theme == "dark" ? "${colours[token][1]}" : "${colours[token][0]}")`;

/** Every place a colour goes, read with `read`; the twin differs only in the text of those reads. */
function card(read: Read, withPalette: boolean, theme?: string): Design {
  const c = (token: Token) => `{{ ${read(token)} }}` as Binding;
  const chip: ComponentDefinition = {
    width: 40,
    height: 16,
    props: {
      theme: { type: "string", default: "light" },
      tone: { type: "color", default: "#000000" },
    },
    layers: [{ type: "rect", width: 40, height: 16, fill: "{{ props.tone }}", stroke: c("ink") }],
  };
  const layers: Layer[] = [
    {
      type: "rect",
      width: 100,
      height: 30,
      fill: {
        type: "linear",
        stops: [
          { offset: 0, color: c("soft") },
          { offset: 1, color: c("accent") },
        ],
      },
      stroke: c("ink"),
      strokeWidth: 2,
    },
    {
      type: "rect",
      y: 40,
      width: 20,
      height: 20,
      let: { line: c("ink") },
      fill: c("bg"),
      stroke: "{{ line }}",
      animate: {
        fill: {
          keyframes: [
            { offset: 0, value: c("accent") },
            { offset: 1, value: c("ink") },
          ],
        },
      },
    },
    {
      type: "group",
      y: 70,
      repeat: { each: "{{ [1, 2, 3] }}" },
      children: [
        { type: "ellipse", x: "{{ item * 20 }}", width: 10, height: 10, fill: c("accent") },
      ],
    },
    { type: "text", y: 90, content: `ink ${c("ink")}`, font: "m", fill: c("ink") },
    {
      type: "component",
      ref: "chip",
      x: 120,
      props: { theme: "{{ props.theme }}", tone: c("accent") },
    },
  ];
  return {
    version: 0,
    canvas: { width: 200, height: 120, background: c("bg") },
    assets: { fonts: { m: fontAssets.medium } },
    ...(withPalette ? { palette } : {}),
    animation: { duration: 1000 },
    components: {
      card: {
        props: { theme: { type: "enum", values: ["light", "dark"], default: "light" } },
        layers,
      },
      chip,
    },
    layers: [
      {
        type: "component",
        ref: "card",
        ...(theme === undefined ? {} : { props: { theme } }),
      },
    ],
  };
}

describe("a palette renders the same bytes as its theme ternaries", () => {
  test.each([
    ["light", "light"],
    ["dark", "dark"],
    ["the default", undefined],
    ["a binding", "{{ settings.theme }}"],
  ] as const)("in mode %s", (_mode, theme) => {
    const data = { settings: { theme: "dark" } };
    const design = card(viaPalette, true, theme);
    const twin = card(viaTernary, false, theme);
    const svg = svgOf(design, { data });
    expect(svg).toBe(svgOf(twin, { data }));
    expect(svgOf(design, { data })).toBe(svg);
    for (const time of [0, 500, 1000]) {
      expect(svgOf(design, { data, time })).toBe(svgOf(twin, { data, time }));
    }
    const dark = theme === "dark" || theme === "{{ settings.theme }}";
    expect(svg).toContain(dark ? "#0d1117" : "#ffffff");
    expect(svg).not.toContain(dark ? "#ffffff" : "#0d1117");
  });

  test("the two modes differ", () => {
    expect(svgOf(card(viaPalette, true, "light"))).not.toBe(svgOf(card(viaPalette, true, "dark")));
  });
});

describe("the active mode", () => {
  const rect = (fill: Binding): Layer => ({ type: "rect", width: 1, height: 1, fill });
  const instance = (props?: Record<string, string>): Layer => ({
    type: "component",
    ref: "c",
    ...(props === undefined ? {} : { props }),
  });
  const withRoot = (
    definition: Partial<ComponentDefinition>,
    layers: Layer[] = [instance()],
  ): Design => ({
    version: 0,
    canvas: { width: 10, height: 10, background: "{{ palette.bg }}" },
    palette,
    components: { c: { layers: [rect("{{ palette.ink }}")], ...definition } },
    layers,
  });
  const themeProp = (extra: Record<string, unknown> = {}) => ({
    props: { theme: { type: "string" as const, ...extra } },
  });

  test("is the first mode in document order without a theme prop", () => {
    expect(svgOf(withRoot({}))).toContain('fill="#ffffff"');
    const darkFirst = {
      ...withRoot({}),
      palette: { dark: palette["dark"], light: palette["light"] },
    };
    expect(svgOf(darkFirst as Design)).toContain('fill="#0d1117"');
  });

  test("is the first mode without a root instance", () => {
    const plain: Design = {
      ...withRoot(themeProp({ default: "dark" })),
      layers: [rect("{{ palette.ink }}")],
    };
    expect(svgOf(plain)).toContain('fill="#1f2328"');
    const two = withRoot(themeProp({ default: "dark" }), [instance(), instance()]);
    expect(svgOf(two)).toContain('fill="#ffffff"');
    const repeated = withRoot(themeProp({ default: "dark" }), [
      { ...instance(), repeat: { each: "{{ [1] }}" } },
    ]);
    expect(svgOf(repeated)).toContain('fill="#ffffff"');
  });

  test("is the first mode when the theme prop has no value", () => {
    expect(svgOf(withRoot(themeProp()))).toContain('fill="#ffffff"');
  });

  test("comes from the default, which is literal", () => {
    expect(svgOf(withRoot(themeProp({ default: "dark" })))).toContain('fill="#0d1117"');
    expect(issuesOf(withRoot(themeProp({ default: "{{ settings.theme }}" })))).toEqual([
      {
        path: "/components/c/props/theme/default",
        code: "type",
        message: 'theme "{{ settings.theme }}" names no palette mode ("light", "dark")',
      },
    ]);
  });

  test("a binding is evaluated over the data, before any let or palette", () => {
    const bound = withRoot(themeProp(), [instance({ theme: "{{ settings.theme }}" })]);
    expect(svgOf(bound, { data: { settings: { theme: "dark" } } })).toContain('fill="#0d1117"');
    const local = withRoot(themeProp(), [
      { ...instance({ theme: "{{ mode }}" }), let: { mode: "{{ 'dark' }}" } },
    ]);
    expect(issuesOf(local)).toMatchObject([{ path: "/layers/0/props/theme", code: "binding" }]);
  });

  test.each([
    ["an unknown mode", "blue", '"blue"'],
    ["__proto__", "__proto__", '"__proto__"'],
    ["toString", "toString", '"toString"'],
  ])("%s is a type issue at the prop", (_case, theme, shown) => {
    expect(issuesOf(withRoot(themeProp(), [instance({ theme })]))).toEqual([
      {
        path: "/layers/0/props/theme",
        code: "type",
        message: `theme ${shown} names no palette mode ("light", "dark")`,
      },
    ]);
  });

  test.each([
    ["null", null],
    ["a number", 3],
    ["a list", ["dark"]],
  ])("a binding giving %s is a type issue at the prop", (_case, value) => {
    const design = withRoot(themeProp(), [instance({ theme: "{{ settings.theme }}" })]);
    expect(issuesOf(design, { data: { settings: { theme: value } } })).toMatchObject([
      { path: "/layers/0/props/theme", code: "type" },
    ]);
  });

  test("the message lists at most eight modes", () => {
    const modes = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`m${String(i)}`, palette["light"]]),
    );
    const design = { ...withRoot(themeProp(), [instance({ theme: "x" })]), palette: modes };
    expect(issuesOf(design as Design)[0]?.message).toBe(
      'theme "x" names no palette mode ("m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", ...)',
    );
  });
});

describe("palette reads", () => {
  const text = (content: string): Design => ({
    version: 0,
    canvas: { width: 100, height: 20 },
    assets: { fonts: { m: fontAssets.medium } },
    palette,
    layers: [{ type: "text", content, font: "m" }],
  });

  test("a data key palette fails at the palette", () => {
    expect(issuesOf(text("x"), { data: { palette: {} } })).toEqual([
      { path: "/palette", code: "binding", message: 'the palette hides the data name "palette"' },
    ]);
  });

  test("a computed read of an unknown token is null", () => {
    expect(svgOf(text("{{ palette[key] == null }}"), { data: { key: "nope" } })).toContain(
      ">true<",
    );
    expect(svgOf(text("{{ palette[key] }}"), { data: { key: "ink" } })).toContain(">#1f2328<");
  });

  test("__proto__ and constructor are plain tokens and pollute nothing", () => {
    const tokens = JSON.parse('{"__proto__":"#123456","constructor":"#654321"}') as Record<
      string,
      `#${string}`
    >;
    const design: Design = {
      version: 0,
      canvas: { width: 10, height: 10, background: "{{ palette.constructor }}" },
      palette: { light: tokens },
      layers: [{ type: "rect", width: 1, height: 1, fill: "{{ palette.__proto__ }}" }],
    };
    const svg = svgOf(design);
    expect(svg).toContain('fill="#654321"');
    expect(svg).toContain('fill="#123456"');
    expect(Object.hasOwn(Object.prototype, "#123456")).toBe(false);
    expect(({} as Record<string, unknown>)["constructor"]).toBe(Object);
  });

  test("an unvalidated palette that is not an object is a type issue", () => {
    const design = { ...text("x"), palette: [] } as unknown as Design;
    expect(issuesOf(design)).toMatchObject([{ path: "/palette", code: "type" }]);
  });
});

/** The fewest expression steps the render needs, found by bisection over `maxExpressionSteps`. */
function minimumSteps(design: Design, data: Readonly<Record<string, unknown>> = {}): number {
  const renders = (steps: number) =>
    renderSvg(design, { data, limits: { maxExpressionSteps: steps } }).ok;
  let low = 0;
  let high = 1;
  while (!renders(high)) high *= 2;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (renders(middle)) high = middle;
    else low = middle;
  }
  return high;
}

describe("the step budget", () => {
  const repeated = (extra: Partial<Design>): Design => ({
    version: 0,
    canvas: { width: 10, height: 10 },
    ...extra,
    layers: [
      {
        type: "group",
        repeat: { each: "{{ items }}" },
        let: { n: "{{ item * 2 }}" },
        children: [{ type: "rect", x: "{{ n }}", width: 1, height: 1, fill: "#000" }],
      },
    ],
  });
  const data = { items: [1, 2, 3, 4, 5] };

  test("a design without a palette takes the steps it took before palettes", () => {
    expect(minimumSteps(repeated({}), data)).toBe(47);
    expect(minimumSteps(card(viaTernary, false, "dark"))).toBe(157);
  });

  test("a palette costs one local per copy of the root scope and nothing per read", () => {
    const without = minimumSteps(repeated({}), data);
    // Each of the 5 items copies one more local, and each item's let copies it once more.
    expect(minimumSteps(repeated({ palette }), data)).toBe(without + 5 + 5);
  });
});
