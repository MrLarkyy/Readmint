import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { DesignLimits, designJsonSchema, PathData, validateDesign } from "../src/index.js";
import { maximalDesign } from "./maximalDesign.js";

const base = () => ({ version: 0, canvas: { width: 10, height: 10 }, layers: [] as unknown[] });
const rect = (extra: Record<string, unknown> = {}) => ({
  type: "rect",
  width: 1,
  height: 1,
  ...extra,
});

function issuesOf(value: unknown) {
  const result = validateDesign(value);
  if (result.ok) throw new Error("expected issues");
  return result;
}

describe("validateDesign", () => {
  test("a design with every optional property set is valid", () => {
    expect(validateDesign(maximalDesign)).toEqual({ ok: true, value: maximalDesign });
  });

  test("returns the caller's object and never changes it", () => {
    const input = { ...base(), layers: [rect()] };
    const before = structuredClone(input);
    const result = validateDesign(input);
    expect(result.ok && result.value).toBe(input);
    expect(input).toEqual(before);
  });

  test("record keys are escaped in pointers", () => {
    expect(issuesOf({ ...base(), styles: { "a/b~c": {} } }).issues).toMatchObject([
      { path: "/styles/a~1b~0c", code: "pattern" },
    ]);
  });

  test("an over-long or control-character key is reported at its parent", () => {
    const long = "k".repeat(200);
    const result = issuesOf({ ...base(), [long]: 1, "line\nbreak": 2 });
    expect(result.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "", code: "unknown-property" },
      { path: "", code: "unknown-property" },
    ]);
    expect(result.issues[1]?.message).toBe('unknown property "line\\nbreak"');
  });

  test("bidi and separator characters never reach a path or message raw", () => {
    for (const unit of [
      0x061c, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069, 0x85,
    ]) {
      const key = `a${String.fromCharCode(unit)}b`;
      const { issues } = issuesOf({ ...base(), [key]: 1 });
      expect(issues[0]?.path, unit.toString(16)).toBe("");
      expect(issues[0]?.message).toBe(
        `unknown property "a\\u${unit.toString(16).padStart(4, "0")}b"`,
      );
    }
  });

  test("a __proto__ key is an unknown property and pollutes nothing", () => {
    const value = JSON.parse(
      '{"version":0,"canvas":{"width":1,"height":1},"layers":[],"__proto__":{"polluted":1},' +
        '"styles":{"__proto__":{"fill":"#fff"}}}',
    ) as unknown;
    expect(issuesOf(value).issues).toMatchObject([
      { path: "/__proto__", code: "unknown-property" },
      { path: "/styles/__proto__", code: "pattern" },
    ]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  test("issues come in document order, identical on every run", () => {
    const value = {
      ...base(),
      layers: [rect({ fill: "red", zzz: 1 }), rect({ opacity: 3 })],
      title: 1,
    };
    const first = issuesOf(value).issues;
    expect(first.map((issue) => issue.path)).toEqual([
      "/layers/0/fill",
      "/layers/0/zzz",
      "/layers/1/opacity",
      "/title",
    ]);
    expect(issuesOf(value).issues).toEqual(first);
  });

  test("more than maxIssues issues are capped and marked truncated", () => {
    const layers = Array.from({ length: 150 }, () => rect({ extra: true }));
    const result = issuesOf({ ...base(), layers });
    expect(result.issues).toHaveLength(DesignLimits.maxIssues);
    expect(result.truncated).toBe(true);
  });

  test("a non-JSON value is a type issue", () => {
    expect(issuesOf({ ...base(), title: new Date(0) }).issues).toMatchObject([
      { path: "/title", code: "type" },
    ]);
    expect(issuesOf(new Map()).issues).toMatchObject([{ path: "", code: "type" }]);
  });

  test("a bindable property names both accepted forms", () => {
    expect(issuesOf({ ...base(), layers: [rect({ opacity: "half" })] }).issues).toEqual([
      { path: "/layers/0/opacity", code: "type", message: "expected a number or a {{binding}}" },
    ]);
    expect(issuesOf({ ...base(), layers: [rect({ opacity: "{{x" })] }).issues).toMatchObject([
      { path: "/layers/0/opacity", code: "pattern" },
    ]);
  });
});

describe("path data templates", () => {
  const path = (d: string) => ({ ...base(), layers: [{ type: "path", d }] });

  test("a d with placeholders around path data is valid", () => {
    expect(validateDesign(path("M0 {{ props.y | round(2) }} L{{ 10 }} 0 Z")).ok).toBe(true);
    expect(validateDesign(path("{{ props.d }}")).ok).toBe(true);
  });

  test("a non-path character outside the placeholders fails pattern", () => {
    expect(issuesOf(path('M0 {{ 1 }} <rect x="0"/>')).issues).toMatchObject([
      { path: "/layers/0/d", code: "pattern" },
    ]);
  });

  test("a template longer than an expression text may be fails length", () => {
    const long = `M0 {{ 1 }}${" L1 1".repeat(2000)}`;
    expect(long.length).toBeGreaterThan(PathData.maxTemplateLength);
    expect(issuesOf(path(long)).issues).toEqual([
      { path: "/layers/0/d", code: "length", message: "must be at most 10000 characters" },
    ]);
  });

  test("a d over maxLength characters fails length, a template too", () => {
    const literal = "M".padEnd(PathData.maxLength + 1, "0");
    expect(issuesOf(path(literal)).issues).toMatchObject([{ path: "/layers/0/d", code: "length" }]);
    expect(issuesOf(path(`{{ 1 }}${literal}`)).issues).toMatchObject([
      { path: "/layers/0/d", code: "length" },
    ]);
  });

  test("an empty d still fails length", () => {
    expect(issuesOf(path("")).issues).toEqual([
      { path: "/layers/0/d", code: "length", message: "must not be empty" },
    ]);
  });
});

describe("asset sources", () => {
  test("an over-long relative path fails length, not pattern", () => {
    const font = {
      ...base(),
      assets: {
        fonts: {
          f: { family: "F", src: `${"a".repeat(1021)}.ttf`, licence: { embedding: "allowed" } },
        },
      },
    };
    expect(issuesOf(font).issues).toEqual([
      {
        path: "/assets/fonts/f/src",
        code: "length",
        message: "must be at most 1024 characters",
      },
    ]);
    const image = { ...base(), assets: { images: { i: { src: `${"a".repeat(1021)}.png` } } } };
    expect(issuesOf(image).issues).toEqual([
      {
        path: "/assets/images/i/src",
        code: "length",
        message: "must be at most 1024 characters",
      },
    ]);
  });
});

describe("limits", () => {
  test("more than maxLayers layers fail", () => {
    const layers = Array.from({ length: DesignLimits.maxLayers + 1 }, () => rect());
    expect(issuesOf({ ...base(), layers }).issues).toMatchObject([
      { path: "/layers", code: "too-many-layers" },
    ]);
    expect(validateDesign({ ...base(), layers: layers.slice(1) }).ok).toBe(true);
  });

  test("component instances count with their expanded layers", () => {
    const hundred = Array.from({ length: 100 }, () => rect());
    const refs = Array.from({ length: 100 }, () => ({ type: "component", ref: "inner" }));
    const value = {
      ...base(),
      components: { inner: { layers: hundred }, outer: { layers: refs } },
      layers: [{ type: "component", ref: "outer" }],
    };
    expect(issuesOf(value).issues).toMatchObject([{ code: "too-many-layers" }]);
  });

  function componentChain(length: number, backRefs: number) {
    const instance = (ref: string) => ({ type: "component", ref });
    const components: Record<string, { layers: unknown[] }> = {};
    for (let index = 0; index < length - 1; index++)
      components[`c${String(index)}`] = { layers: [instance(`c${String(index + 1)}`)] };
    components[`c${String(length - 1)}`] = {
      layers: Array.from({ length: backRefs }, () => instance("c0")),
    };
    return { ...base(), components };
  }

  test("a component cycle names a short loop in full", () => {
    expect(issuesOf(componentChain(3, 1)).issues).toEqual([
      {
        path: "/components/c2/layers/0/ref",
        code: "component-cycle",
        message: 'component cycle "c0" -> "c1" -> "c2" -> "c0"',
      },
    ]);
  });

  test("a long component chain closed by many refs is checked in linear time", () => {
    const started = performance.now();
    const result = issuesOf(componentChain(4000, 5000));
    expect(performance.now() - started).toBeLessThan(2000 * loadScale());
    expect(result.truncated).toBe(true);
    expect(result.issues[0]).toEqual({
      path: "/components/c3999/layers/0/ref",
      code: "component-cycle",
      message: 'component cycle "c0" -> "c1" -> "c2" -> … -> "c3998" -> "c3999" -> "c0"',
    });
  });

  test("too many layers is decided before the cycle search", () => {
    const started = performance.now();
    expect(issuesOf(componentChain(8000, 130_000)).issues).toEqual([
      expect.objectContaining({ path: "/layers", code: "too-many-layers" }),
    ]);
    expect(performance.now() - started).toBeLessThan(2000 * loadScale());
  });

  test("a cyclic or massively shared object fails without hanging", () => {
    const layers: unknown[] = [];
    layers.push(layers, layers);
    expect(issuesOf({ ...base(), layers }).issues).toMatchObject([{ code: "too-deep" }]);

    const shared = Array.from({ length: 1000 }, () => 0);
    const wide = Array.from({ length: 1001 }, () => shared);
    expect(issuesOf({ ...base(), layers: wide }).issues).toMatchObject([{ code: "too-large" }]);
  });

  test("nesting deeper than maxDepth fails", () => {
    let layer: Record<string, unknown> = rect();
    for (let level = 0; level < 40; level++) layer = { type: "group", children: [layer] };
    expect(issuesOf({ ...base(), layers: [layer] }).issues).toMatchObject([
      { path: "", code: "too-deep" },
    ]);
  });

  test("messages never echo more than maxEcho characters of an input value", () => {
    const long = "Z".repeat(500);
    const value = {
      ...base(),
      [long]: 1,
      title: long,
      styles: { [long]: {} },
      layers: [
        rect({ fill: long, fit: long, style: long }),
        { type: long },
        { type: "image", asset: "a", width: 1, height: 1, fit: long },
      ],
    };
    const { issues } = issuesOf(value);
    expect(issues.length).toBeGreaterThan(5);
    for (const issue of issues) {
      expect(issue.message).not.toMatch(/Z{64}/u);
      expect(issue.path).not.toMatch(/Z{65}/u);
    }
  });
});

describe("hostile strings", () => {
  const megabyte = 1 << 20;
  const hostile = [
    "a".repeat(megabyte),
    `{{${"}".repeat(megabyte)}x`,
    `{{${"{".repeat(megabyte)}`,
    `#${"0".repeat(megabyte)}`,
    `${"a/".repeat(megabyte / 2)}..`,
    `${"../".repeat(megabyte / 3)}x.png`,
    `${"/".repeat(megabyte)}x.png`,
    `data:image/png;base64,${"A".repeat(megabyte)}!`,
    `M${"0 ".repeat(megabyte / 2)}<`,
    `${" ".repeat(megabyte)}!`,
  ];

  test("every schema pattern runs in linear time", () => {
    const patterns = collectPatterns(designJsonSchema);
    expect(patterns.length).toBeGreaterThan(6);
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, "u");
      for (const value of hostile) {
        const started = performance.now();
        regex.test(value);
        const elapsed = performance.now() - started;
        // The load probe costs more than most of these runs, so it only runs for a slow one.
        const limit = elapsed < 200 ? 200 : 200 * loadScale();
        expect(elapsed, `${pattern} on ${value.slice(0, 20)}`).toBeLessThan(limit);
      }
    }
  }, 60_000);

  test("validation of a design full of hostile strings stays fast", () => {
    for (const value of hostile) {
      const design = {
        ...base(),
        title: value,
        assets: { images: { a: { src: value } } },
        styles: { s: { fill: value } },
        layers: [
          { type: "path", d: value, fill: value },
          { type: "text", content: value, font: value, opacity: value, if: value },
          { type: "image", asset: value, width: 1, height: 1 },
        ],
      };
      const started = performance.now();
      expect(validateDesign(design).ok).toBe(false);
      expect(performance.now() - started).toBeLessThan(200 * loadScale());
    }
  });
});

describe("an asset src bound to data (RM-28)", () => {
  const font = (src: string) => ({ family: "F", src, licence: { embedding: "allowed" } });
  const withImage = (src: string) => ({
    ...base(),
    assets: { images: { avatar: { src } } },
    layers: [{ type: "image", asset: "avatar", width: 8, height: 8 }],
  });

  test("an image src may be a binding", () => {
    expect(validateDesign(withImage("{{ github.avatarUrl }}")).ok).toBe(true);
  });

  test("an unclosed image src binding is refused at the src", () => {
    expect(issuesOf(withImage("{{ github.avatarUrl")).issues).toMatchObject([
      { path: "/assets/images/avatar/src", code: "pattern" },
    ]);
  });

  test("a font src may not be a binding", () => {
    const design = { ...base(), assets: { fonts: { f: font("{{ github.fontUrl }}") } } };
    expect(issuesOf(design).issues).toMatchObject([{ path: "/assets/fonts/f/src" }]);
  });
});

function collectPatterns(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) collectPatterns(item, found);
  else if (typeof node === "object" && node !== null)
    for (const [key, value] of Object.entries(node)) {
      if (key === "pattern" && typeof value === "string") found.push(value);
      else collectPatterns(value, found);
    }
  return found;
}
