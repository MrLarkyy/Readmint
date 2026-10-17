import { describe, expect, test } from "vitest";
import { loadScale, timed } from "../../../test-support/loadScale.js";
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

  test("canvas bindings may name the props of the root instance, with no version step", () => {
    const design = {
      version: 0,
      canvas: { width: 100, height: "{{ props.n * 10 }}", background: "{{ props.tone }}" },
      components: {
        card: {
          props: { n: { type: "number", default: 2 }, tone: { type: "color", default: "#000000" } },
          layers: [rect()],
        },
      },
      layers: [{ type: "component", ref: "card", props: { n: 3 } }],
    };
    expect(validateDesign(design)).toEqual({ ok: true, value: design });
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

describe("font licence (RM-45)", () => {
  const withLicence = (licence: Record<string, unknown>) => ({
    ...base(),
    assets: { fonts: { x: { family: "X", src: "fonts/x.ttf", licence } } },
  });

  test.each([true, false])("reservedFontName %s is a valid v0 licence option", (value) => {
    const design = withLicence({ embedding: "allowed", name: "OFL-1.1", reservedFontName: value });
    expect(validateDesign(design)).toEqual({ ok: true, value: design });
  });

  test.each(["yes", 1, null])("reservedFontName %j is a type issue at the option", (value) => {
    expect(
      issuesOf(withLicence({ embedding: "allowed", reservedFontName: value })).issues,
    ).toMatchObject([{ path: "/assets/fonts/x/licence/reservedFontName", code: "type" }]);
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
    const chain = componentChain(4000, 5000);
    const { value: result, ms, scale } = timed(() => issuesOf(chain));
    expect(ms).toBeLessThan(2000 * scale);
    expect(result.truncated).toBe(true);
    expect(result.issues[0]).toEqual({
      path: "/components/c3999/layers/0/ref",
      code: "component-cycle",
      message: 'component cycle "c0" -> "c1" -> "c2" -> … -> "c3998" -> "c3999" -> "c0"',
    });
  });

  test("too many layers is decided before the cycle search", () => {
    const chain = componentChain(8000, 130_000);
    const { value: result, ms, scale } = timed(() => issuesOf(chain));
    expect(result.issues).toEqual([
      expect.objectContaining({ path: "/layers", code: "too-many-layers" }),
    ]);
    expect(ms).toBeLessThan(2000 * scale);
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
    const before = loadScale();
    const patterns = collectPatterns(designJsonSchema);
    expect(patterns.length).toBeGreaterThan(6);
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, "u");
      for (const value of hostile) {
        const started = performance.now();
        regex.test(value);
        const elapsed = performance.now() - started;
        // The load probe costs more than most of these runs, so it only runs for a slow one.
        const limit = elapsed < 200 ? 200 : 200 * Math.max(before, loadScale());
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
      const { value: result, ms, scale } = timed(() => validateDesign(design));
      expect(result.ok).toBe(false);
      expect(ms).toBeLessThan(200 * scale);
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

describe("enum and array props (RM-50)", () => {
  const withProp = (definition: unknown, props: unknown) => ({
    ...base(),
    components: { c: { props: { p: definition }, layers: [] } },
    layers: [{ type: "component", ref: "c", props: { p: props } }],
  });
  const mode = { type: "enum", values: ["horizontal", "vertical"] };

  test("an unlisted literal enum value is one enum issue at the prop", () => {
    const { issues } = issuesOf(withProp(mode, "diagonal"));
    expect(issues).toEqual([
      {
        path: "/layers/0/props/p",
        code: "enum",
        message: 'expected one of "horizontal", "vertical", got "diagonal"',
      },
    ]);
  });

  test("a listed value and a binding are valid", () => {
    expect(validateDesign(withProp(mode, "vertical")).ok).toBe(true);
    expect(validateDesign(withProp(mode, "{{ orientation }}")).ok).toBe(true);
  });

  test("an enum default that is not listed is an enum issue at the default", () => {
    expect(issuesOf(withProp({ ...mode, default: "x" }, "vertical")).issues).toMatchObject([
      { path: "/components/c/props/p/default", code: "enum" },
    ]);
  });

  test("the message lists at most eight values", () => {
    const values = Array.from({ length: 9 }, (_, i) => `v${String(i)}`);
    const [issue] = issuesOf(withProp({ type: "enum", values }, "z")).issues;
    expect(issue?.message).toBe(
      `expected one of ${values
        .slice(0, 8)
        .map((v) => `"${v}"`)
        .join(", ")}, ..., got "z"`,
    );
  });

  test("enum value lists and values are bounded", () => {
    const tooLong = issuesOf(withProp({ type: "enum", values: ["x".repeat(129)] }, "x"));
    expect(tooLong.issues).toMatchObject([{ code: "length" }]);
    const many = Array.from({ length: 65 }, (_, i) => `v${String(i)}`);
    expect(issuesOf(withProp({ type: "enum", values: many }, "v1")).issues).toMatchObject([
      { path: "/components/c/props/p/values", code: "count" },
    ]);
  });

  test("literal lists: scalars up to 1000", () => {
    const list = { type: "array" };
    expect(validateDesign(withProp(list, [1, "a", true])).ok).toBe(true);
    expect(
      issuesOf(
        withProp(
          list,
          Array.from({ length: 1001 }, () => 1),
        ),
      ).issues,
    ).toMatchObject([{ path: "/layers/0/props/p", code: "count" }]);
  });

  test("a list for a string prop and an object for a string prop are type issues", () => {
    expect(issuesOf(withProp({ type: "string" }, ["a"])).issues).toMatchObject([
      { path: "/layers/0/props/p", code: "type" },
    ]);
    const issues = issuesOf(withProp({ type: "string" }, {})).issues;
    expect(issues).toMatchObject([{ path: "/layers/0/props/p", code: "type" }]);
    expect(issues[0]?.message).toBe(
      "expected a string, a number, true or false or a list of prop values",
    );
  });

  test("an unknown prop type stays an enum issue at the type", () => {
    expect(issuesOf(withProp({ type: "list" }, "a")).issues).toMatchObject([
      { path: "/components/c/props/p/type", code: "enum" },
    ]);
  });
});

describe("prop messages and literal defaults (RM-50)", () => {
  const withDefault = (definition: unknown) => ({
    ...base(),
    components: { c: { props: { p: definition }, layers: [] } },
  });

  test("an enum default that looks like a binding is an enum issue", () => {
    expect(
      issuesOf(withDefault({ type: "enum", values: ["a"], default: "{{ x }}" })).issues,
    ).toMatchObject([{ path: "/components/c/props/p/default", code: "enum" }]);
  });

  test("a number default that looks like a binding is a type issue", () => {
    expect(issuesOf(withDefault({ type: "number", default: "{{ x }}" })).issues).toMatchObject([
      { path: "/components/c/props/p/default", code: "type" },
    ]);
  });

  test("string and color defaults with braces are literal text and stay valid", () => {
    expect(validateDesign(withDefault({ type: "string", default: "{{ x }}" })).ok).toBe(true);
    expect(validateDesign(withDefault({ type: "color", default: "{{ x }}" })).ok).toBe(true);
  });

  const instance = (definition: unknown, value: unknown) => ({
    ...withDefault(definition),
    layers: [{ type: "component", ref: "c", props: { p: value } }],
  });

  test("a wrong enum prop value names the allowed values", () => {
    expect(issuesOf(instance({ type: "enum", values: ["a", "b"] }, 5)).issues[0]?.message).toBe(
      'expected one of "a", "b" or a {{binding}}',
    );
  });

  test("a wrong array prop value says an array", () => {
    expect(issuesOf(instance({ type: "array" }, 5)).issues[0]?.message).toBe(
      "expected an array or a {{binding}}",
    );
  });
});

describe("local bindings (let, RM-118)", () => {
  const withLayers = (...layers: unknown[]) => ({ ...base(), layers });
  const codes = (value: unknown) =>
    issuesOf(value).issues.map(({ path, code }) => ({ path, code }));
  const valid = (value: unknown) => {
    expect(validateDesign(value)).toEqual({ ok: true, value });
  };
  const font = { family: "F", src: "f.ttf", licence: { embedding: "allowed" } };
  const kinds: readonly (readonly [string, Record<string, unknown>])[] = [
    ["group", { type: "group", children: [] }],
    ["rect", rect()],
    ["ellipse", { type: "ellipse", width: 1, height: 1 }],
    ["path", { type: "path", d: "M0 0" }],
    ["text", { type: "text", content: "{{ n }}", font: "f" }],
    ["image", { type: "image", asset: "i", width: 1, height: 1 }],
    ["component", { type: "component", ref: "c" }],
  ];

  test.each(kinds)("a %s layer may bind locals", (_kind, layer) => {
    valid({
      ...base(),
      assets: { fonts: { f: font }, images: { i: { src: "i.png" } } },
      components: { c: { layers: [] } },
      layers: [{ ...layer, let: { n: "{{ 1 }}", m: "{{ n }} and {{ n }}" } }],
    });
  });

  test.each(["a-1", "1a", "a b", "a-", "é"])("the name %j is a pattern issue", (key) => {
    const result = issuesOf(withLayers(rect({ let: { [key]: "{{ 1 }}" } })));
    expect(result.issues).toEqual([
      {
        path: `/layers/0/let/${key}`,
        code: "pattern",
        message: `property name ${JSON.stringify(key)} is not a local name (a letter or _, then letters, digits, _ and - before a letter or _; at most 64)`,
      },
    ]);
  });

  test("a name of 64 characters is valid, of 65 a pattern issue reported at the let", () => {
    valid(withLayers(rect({ let: { ["n".repeat(64)]: "{{ 1 }}" } })));
    expect(codes(withLayers(rect({ let: { ["n".repeat(65)]: "{{ 1 }}" } })))).toEqual([
      { path: "/layers/0/let", code: "pattern" },
    ]);
  });

  test("64 entries are valid, 65 a count issue at the let", () => {
    const entries = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`n${String(i)}`, "{{ 1 }}"]));
    valid(withLayers(rect({ let: entries(DesignLimits.maxLetEntries) })));
    expect(issuesOf(withLayers(rect({ let: entries(65) }))).issues).toEqual([
      { path: "/layers/0/let", code: "count", message: "must have at most 64 entries" },
    ]);
  });

  test("a value must be a binding", () => {
    expect(codes(withLayers(rect({ let: { a: 3, b: "abc", c: "{{ 1 }}" } })))).toEqual([
      { path: "/layers/0/let/a", code: "type" },
      { path: "/layers/0/let/b", code: "pattern" },
    ]);
  });

  test.each(["props", "true", "false", "null"])("%s is a reserved name", (name) => {
    expect(issuesOf(withLayers(rect({ let: { [name]: "{{ 1 }}" } }))).issues).toEqual([
      {
        path: `/layers/0/let/${name}`,
        code: "reserved-name",
        message: `"${name}" is reserved and cannot be a let name`,
      },
    ]);
  });

  test("a let name bound by the layer's own repeat, default or named, is a duplicate", () => {
    const repeat = { each: "{{ [1] }}" };
    expect(codes(withLayers(rect({ repeat, let: { item: "{{ 1 }}" } })))).toEqual([
      { path: "/layers/0/let/item", code: "duplicate-name" },
    ]);
    const named = { each: "{{ [1] }}", as: "row", index: "i" };
    expect(
      issuesOf(withLayers(rect({ repeat: named, let: { i: "{{ 1 }}", index: "{{ 2 }}" } }))).issues,
    ).toEqual([
      {
        path: "/layers/0/let/i",
        code: "duplicate-name",
        message: 'let name "i" is already bound by the repeat at /layers/0/repeat/index',
      },
    ]);
  });

  test("a child let reusing an enclosing let or repeat name is a duplicate", () => {
    const design = withLayers({
      type: "group",
      repeat: { each: "{{ [1] }}", as: "row" },
      let: { n: "{{ 1 }}" },
      children: [rect({ let: { n: "{{ 2 }}", row: "{{ 3 }}", fresh: "{{ 4 }}" } })],
    });
    expect(issuesOf(design).issues).toEqual([
      {
        path: "/layers/0/children/0/let/n",
        code: "duplicate-name",
        message: 'let name "n" is already bound by the let at /layers/0/let/n',
      },
      {
        path: "/layers/0/children/0/let/row",
        code: "duplicate-name",
        message: 'let name "row" is already bound by the repeat at /layers/0/repeat/as',
      },
    ]);
  });

  test("a repeat name hiding an enclosing let name is a duplicate at the name or the repeat", () => {
    const design = withLayers({
      type: "group",
      let: { row: "{{ 1 }}", item: "{{ 2 }}" },
      children: [
        rect({ repeat: { each: "{{ [1] }}", as: "row" } }),
        rect({ repeat: { each: "{{ [1] }}" } }),
      ],
    });
    expect(issuesOf(design).issues).toEqual([
      {
        path: "/layers/0/children/0/repeat/as",
        code: "duplicate-name",
        message: 'repeat name "row" hides the let name bound at /layers/0/let/row',
      },
      {
        path: "/layers/0/children/1/repeat",
        code: "duplicate-name",
        message: 'repeat name "item" hides the let name bound at /layers/0/let/item',
      },
    ]);
  });

  test("children written before the let still see its names", () => {
    const design = withLayers({
      type: "group",
      children: [rect({ let: { n: "{{ 2 }}" } })],
      let: { n: "{{ 1 }}" },
    });
    expect(codes(design)).toEqual([{ path: "/layers/0/children/0/let/n", code: "duplicate-name" }]);
  });

  test("siblings, nested repeats and component definitions are separate", () => {
    valid({
      ...base(),
      components: { c: { layers: [rect({ let: { n: "{{ 3 }}" } })] } },
      layers: [
        rect({ let: { n: "{{ 1 }}" } }),
        rect({ let: { n: "{{ 2 }}" } }),
        {
          type: "group",
          repeat: { each: "{{ [1] }}" },
          children: [rect({ repeat: { each: "{{ [2] }}" } })],
        },
        { type: "group", let: { n: "{{ 4 }}" }, children: [{ type: "component", ref: "c" }] },
      ],
    });
  });

  test("__proto__ and constructor are plain names and pollute nothing", () => {
    const layer = JSON.parse(
      '{"type":"rect","width":1,"height":1,"let":{"__proto__":"{{ 1 }}","constructor":"{{ 2 }}"}}',
    ) as unknown;
    valid(withLayers(layer));
    expect(Object.hasOwn(Object.prototype, "0")).toBe(false);
    expect(({} as Record<string, unknown>)["constructor"]).toBe(Object);
  });

  test("many repeated leaves under deep full lets are checked fast", () => {
    const names = (level: number) =>
      Object.fromEntries(
        Array.from({ length: 64 }, (_, i) => [`l${String(level)}_${String(i)}`, "{{ 1 }}"]),
      );
    const leaves = Array.from({ length: 5000 }, () => rect({ repeat: { each: "{{ [1] }}" } }));
    let layer: unknown = { type: "group", let: names(15), children: leaves };
    for (let level = 14; level >= 0; level--) {
      layer = { type: "group", let: names(level), children: [layer] };
    }
    const design = withLayers(layer);
    const { ms, scale } = timed(() => {
      valid(design);
    });
    expect(ms).toBeLessThan(1000 * scale);
  });

  test("issues come in document order across the document and the components", () => {
    const design = {
      ...base(),
      components: { c: { layers: [rect({ let: { props: "{{ 1 }}" } })] } },
      layers: [
        rect({ let: { true: "{{ 1 }}" } }),
        { type: "group", let: { n: "{{ 1 }}" }, children: [rect({ let: { n: "{{ 1 }}" } })] },
      ],
    };
    expect(codes(design)).toEqual([
      { path: "/layers/0/let/true", code: "reserved-name" },
      { path: "/layers/1/children/0/let/n", code: "duplicate-name" },
      { path: "/components/c/layers/0/let/props", code: "reserved-name" },
    ]);
  });
});

describe("palette (RM-119)", () => {
  const palette = {
    light: { bg: "#ffffff", ink: "#1f2328" },
    dark: { bg: "#0d1117", ink: "#e6edf3" },
  };
  const withPalette = (extra: Record<string, unknown>) => ({ ...base(), palette, ...extra });
  const valid = (value: unknown) => {
    expect(validateDesign(value)).toEqual({ ok: true, value });
  };
  const codes = (value: unknown) =>
    issuesOf(value).issues.map(({ path, code }) => ({ path, code }));
  const font = { family: "F", src: "f.ttf", licence: { embedding: "allowed" } };
  const textOf = (content: string) =>
    withPalette({ assets: { fonts: { f: font } }, layers: [{ type: "text", font: "f", content }] });

  test("tokens may be read anywhere a binding goes", () => {
    valid(
      withPalette({
        canvas: { width: 10, height: 10, background: "{{ palette.bg }}" },
        assets: { fonts: { f: font } },
        animation: { duration: 1000 },
        components: {
          c: {
            props: { tone: { type: "color", default: "#000000" } },
            layers: [rect({ fill: "{{ props.tone }}" })],
          },
        },
        layers: [
          rect({
            let: { line: "{{ palette.ink }}" },
            fill: {
              type: "linear",
              stops: [
                { offset: 0, color: "{{ palette.bg }}" },
                { offset: 1, color: '{{ palette["ink"] }}' },
              ],
            },
            stroke: "{{ line }}",
            animate: {
              fill: {
                keyframes: [
                  { offset: 0, value: "{{ palette.bg }}" },
                  { offset: 1, value: "{{ palette.ink }}" },
                ],
              },
            },
          }),
          { type: "text", content: "on {{ palette.bg }}", font: "f", fill: "{{ palette.ink }}" },
          { type: "component", ref: "c", props: { tone: "{{ palette.ink }}" } },
        ],
      }),
    );
  });

  test("a token missing in a mode is located at the mode, naming where it is defined", () => {
    const design = withPalette({
      palette: {
        light: { bg: "#fff", accent: "#0969da" },
        dark: { bg: "#000", line: "#30363d" },
        dim: { line: "#444", bg: "#222", accent: "#111" },
      },
    });
    expect(issuesOf(design).issues).toEqual([
      {
        path: "/palette/light",
        code: "missing-property",
        message: 'missing token "line" (defined in mode "dark")',
      },
      {
        path: "/palette/dark",
        code: "missing-property",
        message: 'missing token "accent" (defined in mode "light")',
      },
    ]);
  });

  test("a read of an unknown token is located at the string", () => {
    const design = withPalette({
      assets: { fonts: { f: font } },
      components: { c: { layers: [rect({ fill: "{{ palette.chip }}" })] } },
      layers: [
        rect({ fill: "{{ palette.fg }}", stroke: "{{ palette['edge'] }}" }),
        {
          type: "text",
          font: "f",
          content: '{{ palette.bg }} and {{ palette.nope }}, {{ palette["nope"] }} once',
        },
      ],
    });
    expect(issuesOf(design).issues).toEqual([
      { path: "/layers/0/fill", code: "unknown-reference", message: 'unknown palette token "fg"' },
      {
        path: "/layers/0/stroke",
        code: "unknown-reference",
        message: 'unknown palette token "edge"',
      },
      {
        path: "/layers/1/content",
        code: "unknown-reference",
        message: 'unknown palette token "nope"',
      },
      {
        path: "/components/c/layers/0/fill",
        code: "unknown-reference",
        message: 'unknown palette token "chip"',
      },
    ]);
  });

  test.each([
    ["a string literal", "{{ 'palette.nope' }}"],
    ["a string literal with an escape and }}", '{{ "a\\"}} palette.nope" }}'],
    ["a property", "{{ x.palette.nope }}"],
    ["text outside the placeholders", "palette.nope {{ 1 }} palette.nope"],
    ["a longer name", "{{ my-palette.nope + palette_x.nope }}"],
    ["a computed key", "{{ palette[name] }}"],
    ["a key with an escape", '{{ palette["n\\u{6f}pe"] }}'],
    ["an unclosed placeholder", "{{ palette.bg"],
  ])("%s is no read of an unknown token", (_case, content) => {
    valid(textOf(content));
  });

  test("text the renderer never evaluates is no read", () => {
    const note = "Set {{ palette.nope }} for links";
    valid({
      ...textOf("x"),
      title: note,
      description: note,
      components: {
        c: {
          description: note,
          props: { label: { type: "string", default: "{{ palette.nope }}" } },
          layers: [rect({})],
        },
      },
    });
  });

  test.each([
    [
      "the canvas",
      { canvas: { width: 1, height: 1, background: "{{ palette.nope }}" } },
      "/canvas/background",
    ],
    ["a style", { styles: { s: { fill: "{{ palette.nope }}" } } }, "/styles/s/fill"],
    ["a layer", { layers: [rect({ fill: "{{ palette.nope }}" })] }, "/layers/0/fill"],
    [
      "a layer animation",
      {
        animation: { duration: 1000 },
        layers: [
          rect({
            animate: {
              fill: {
                keyframes: [
                  { offset: 0, value: "{{ palette.nope }}" },
                  { offset: 1, value: "#000" },
                ],
              },
            },
          }),
        ],
      },
      "/layers/0/animate/fill/keyframes/0/value",
    ],
    [
      "a component",
      { components: { c: { layers: [rect({ fill: "{{ palette.nope }}" })] } } },
      "/components/c/layers/0/fill",
    ],
  ])("an unknown read in %s is reported", (_area, extra, path) => {
    expect(codes(withPalette(extra))).toEqual([{ path, code: "unknown-reference" }]);
  });

  test("without a palette, palette.x is a data read", () => {
    valid({ ...base(), layers: [rect({ fill: "{{ palette.anything }}" })] });
  });

  test("let and repeat names cannot take the name palette when the design has one", () => {
    const layers = [
      rect({ let: { palette: "{{ 1 }}" } }),
      rect({ repeat: { each: "{{ [1] }}", as: "palette" } }),
      rect({ repeat: { each: "{{ [1] }}", index: "palette" } }),
    ];
    valid({ ...base(), layers });
    expect(issuesOf(withPalette({ layers })).issues).toEqual([
      {
        path: "/layers/0/let/palette",
        code: "reserved-name",
        message: `"palette" is reserved by the design's palette and cannot be a let name`,
      },
      {
        path: "/layers/1/repeat/as",
        code: "reserved-name",
        message: `"palette" is reserved by the design's palette and cannot be a repeat name`,
      },
      {
        path: "/layers/2/repeat/index",
        code: "reserved-name",
        message: `"palette" is reserved by the design's palette and cannot be a repeat name`,
      },
    ]);
  });

  test("the default repeat names stay free and a component's let is checked too", () => {
    const design = withPalette({
      components: { c: { layers: [rect({ let: { palette: "{{ 1 }}" } })] } },
      layers: [rect({ repeat: { each: "{{ [1] }}" }, let: { tone: "{{ palette.bg }}" } })],
    });
    expect(codes(design)).toEqual([
      { path: "/components/c/layers/0/let/palette", code: "reserved-name" },
    ]);
  });

  test.each(["true", "false", "null"])("the token %s is reserved in every mode", (token) => {
    const design = withPalette({
      palette: { light: { [token]: "#fff" }, dark: { [token]: "#000" } },
    });
    expect(issuesOf(design).issues).toEqual(
      ["light", "dark"].map((mode) => ({
        path: `/palette/${mode}/${token}`,
        code: "reserved-name",
        message: `"${token}" is reserved and cannot be a palette token`,
      })),
    );
  });

  test("16 modes and 256 tokens are valid, one more of either a count issue", () => {
    const tokens = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`t${String(i)}`, "#000"]));
    const modes = (count: number, size: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`m${String(i)}`, tokens(size)]));
    valid(
      withPalette({ palette: modes(DesignLimits.maxPaletteModes, DesignLimits.maxPaletteTokens) }),
    );
    expect(issuesOf(withPalette({ palette: modes(17, 1) })).issues).toEqual([
      { path: "/palette", code: "count", message: "must have at most 16 entries" },
    ]);
    expect(issuesOf(withPalette({ palette: { light: tokens(257) } })).issues).toEqual([
      { path: "/palette/light", code: "count", message: "must have at most 256 entries" },
    ]);
  });

  test("an empty palette is a count issue; an empty mode is not, it holds no token", () => {
    expect(issuesOf(withPalette({ palette: {} })).issues).toEqual([
      { path: "/palette", code: "count", message: "must have at least 1 entry" },
    ]);
    valid(withPalette({ palette: { light: {} } }));
    const defs = designJsonSchema["$defs"] as Record<string, Record<string, unknown>>;
    expect(defs["Palette"]).toMatchObject({ minProperties: 1, maxProperties: 16 });
    expect(defs["PaletteMode"]).toMatchObject({ maxProperties: 256 });
  });

  test.each([
    ["a list", [], "/palette", "type"],
    ["a mode that is a string", { light: "#fff" }, "/palette/light", "type"],
    ["a token that is an object", { light: { bg: {} } }, "/palette/light/bg", "type"],
    ["a token that is a number", { light: { bg: 3 } }, "/palette/light/bg", "type"],
    ["a token that is a binding", { light: { bg: "{{ 1 }}" } }, "/palette/light/bg", "pattern"],
    ["a colour name", { light: { bg: "red" } }, "/palette/light/bg", "pattern"],
    ["five hex digits", { light: { bg: "#12345" } }, "/palette/light/bg", "pattern"],
    ["a url", { light: { bg: "url(#a)" } }, "/palette/light/bg", "pattern"],
    ["none", { light: { bg: "none" } }, "/palette/light/bg", "pattern"],
    ["a mode key with a digit first", { "1a": { bg: "#fff" } }, "/palette/1a", "pattern"],
    ["a token key a-1", { light: { "a-1": "#fff" } }, "/palette/light/a-1", "pattern"],
  ])("%s is refused", (_case, value, path, code) => {
    expect(codes(withPalette({ palette: value }))).toEqual([{ path, code }]);
  });

  test("a 1 MB flood of token keys is one count issue, found fast", () => {
    const flood = Object.fromEntries(
      Array.from({ length: 100_000 }, (_, i) => [`token${String(i)}`, "#000"]),
    );
    const design = withPalette({ palette: { light: flood } });
    const { value, ms, scale } = timed(() => issuesOf(design));
    expect(value.issues).toEqual([
      { path: "/palette/light", code: "count", message: "must have at most 256 entries" },
    ]);
    expect(ms).toBeLessThan(2000 * scale);
  });

  test("modes sharing one huge token object are refused before validation", () => {
    const shared = Object.fromEntries(
      Array.from({ length: 70_000 }, (_, i) => [`t${String(i)}`, "#000"]),
    );
    const modes = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`m${String(i)}`, shared]),
    );
    expect(issuesOf(withPalette({ palette: modes })).issues).toMatchObject([
      { path: "", code: "too-large" },
    ]);
  });

  test("scanning hostile text for reads stays fast", () => {
    const content = `${"{{ palette.bg ".repeat(300)}}} {{ '${"palette.x ".repeat(450)}`;
    const design = textOf(content);
    const { ms, scale } = timed(() => {
      valid(design);
    });
    expect(ms).toBeLessThan(1000 * scale);
  });

  test("__proto__ and constructor are plain tokens and pollute nothing", () => {
    const design = JSON.parse(
      '{"version":0,"canvas":{"width":10,"height":10,"background":"{{ palette.constructor }}"},' +
        '"palette":{"light":{"__proto__":"#fff","constructor":"#000"},' +
        '"dark":{"constructor":"#111","__proto__":"#eee"}},' +
        '"layers":[{"type":"rect","width":1,"height":1,"fill":"{{ palette.__proto__ }}"}]}',
    ) as Record<string, unknown>;
    valid(design);
    const reading = { ...design, layers: [rect({ fill: "{{ palette.toString }}" })] };
    expect(codes(reading)).toEqual([{ path: "/layers/0/fill", code: "unknown-reference" }]);
    expect(Object.hasOwn(Object.prototype, "#fff")).toBe(false);
  });
});

describe("orbit (RM-111)", () => {
  const orbit = (extra: Record<string, unknown> = {}) => ({
    center: { x: 5, y: 5 },
    radius: 4,
    angle: 30,
    ...extra,
  });
  const timeline = { animation: { duration: 1000 } };
  const withLayers = (layers: unknown[], extra: Record<string, unknown> = timeline) => ({
    ...base(),
    ...extra,
    layers,
  });
  const issues = (value: unknown) => {
    const result = validateDesign(value);
    return result.ok ? [] : result.issues.map(({ path, code }) => ({ path, code }));
  };

  test("a literal and a bound orbit are valid on every layer kind", () => {
    const bound = orbit({
      center: { x: "{{ 5 }}", y: 5 },
      radius: "{{ 4 }}",
      radiusY: 2,
      angle: "{{ 45 }}",
      speed: "{{ -6 }}",
      upright: "{{ false }}",
      fade: { from: -0.5, to: 0.5 },
    });
    const layers = [
      rect({ orbit: orbit() }),
      { type: "path", d: "M0 0 L1 1", orbit: bound },
      { type: "group", children: [rect()], orbit: orbit({ speed: 10 }) },
      { type: "ellipse", width: 1, height: 1, orbit: orbit({ upright: false }) },
    ];
    expect(issues(withLayers(layers))).toEqual([]);
  });

  test.each([
    [{ radius: -1 }, "/layers/0/orbit/radius", "range"],
    [{ radiusY: 100_001 }, "/layers/0/orbit/radiusY", "range"],
    [{ angle: 361 }, "/layers/0/orbit/angle", "range"],
    [{ speed: 3601 }, "/layers/0/orbit/speed", "range"],
    [{ fade: { from: 0, to: 1.5 } }, "/layers/0/orbit/fade/to", "range"],
    [{ fade: { from: "{{ 0 }}", to: 1 } }, "/layers/0/orbit/fade/from", "type"],
    [{ upright: "yes" }, "/layers/0/orbit/upright", "type"],
    [{ tilt: 10 }, "/layers/0/orbit/tilt", "unknown-property"],
    [{ center: { x: 1 } }, "/layers/0/orbit/center/y", "missing-property"],
    [{ center: { x: 1, y: 1, z: 1 } }, "/layers/0/orbit/center/z", "unknown-property"],
  ])("orbit %j fails at %s with %s", (extra, path, code) => {
    expect(issues(withLayers([rect({ orbit: orbit(extra) })]))).toEqual([{ path, code }]);
  });

  test.each([42, "x", null, [1, 2]])("an orbit %j that is no object is a type issue", (value) => {
    expect(issues(withLayers([rect({ orbit: value })]))).toEqual([
      { path: "/layers/0/orbit", code: "type" },
    ]);
  });

  test("radius and angle are required", () => {
    expect(issues(withLayers([rect({ orbit: { center: { x: 1, y: 1 } } })]))).toEqual([
      { path: "/layers/0/orbit/radius", code: "missing-property" },
      { path: "/layers/0/orbit/angle", code: "missing-property" },
    ]);
  });

  test.each(["stack", "grid"])("an orbit is refused as a direct child of a %s group", (type) => {
    const layout = type === "stack" ? { type, direction: "row" } : { type, columns: 2 };
    const inner = { type: "group", children: [rect({ orbit: orbit() })] };
    const group = { type: "group", layout, children: [rect(), rect({ orbit: orbit() }), inner] };
    expect(issues(withLayers([group]))).toEqual([
      { path: "/layers/0/children/1/orbit", code: "type" },
    ]);
  });

  test("an orbit in an absolute group or a component definition is valid", () => {
    const design = withLayers(
      [
        { type: "group", layout: { type: "absolute" }, children: [rect({ orbit: orbit() })] },
        { type: "component", ref: "dot" },
      ],
      { ...timeline, components: { dot: { layers: [rect({ orbit: orbit({ speed: 1 }) })] } } },
    );
    expect(issues(design)).toEqual([]);
  });

  test("a speed without a timeline is reported once at /animation", () => {
    const layers = [rect({ orbit: orbit({ speed: 5 }) }), rect({ orbit: orbit({ speed: 6 }) })];
    expect(issues(withLayers(layers, {}))).toEqual([
      { path: "/animation", code: "missing-property" },
    ]);
    // a static orbit needs no timeline
    expect(issues(withLayers([rect({ orbit: orbit() })], {}))).toEqual([]);
  });

  test("a speed and an animate without a timeline give one /animation issue", () => {
    const animate = {
      x: {
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 1, value: 1 },
        ],
      },
    };
    const layers = [rect({ animate }), rect({ orbit: orbit({ speed: 5 }) })];
    expect(issues(withLayers(layers, {}))).toEqual([
      { path: "/animation", code: "missing-property" },
    ]);
  });

  test("a fade with equal depths is a range issue at to", () => {
    expect(issues(withLayers([rect({ orbit: orbit({ fade: { from: 0.2, to: 0.2 } }) })]))).toEqual([
      { path: "/layers/0/orbit/fade/to", code: "range" },
    ]);
  });

  test("a fade and an opacity track on one layer are refused at the fade", () => {
    const animate = {
      opacity: {
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 1, value: 1 },
        ],
      },
    };
    const layer = rect({ animate, orbit: orbit({ speed: 1, fade: { from: 0, to: 1 } }) });
    expect(issues(withLayers([layer]))).toEqual([{ path: "/layers/0/orbit/fade", code: "type" }]);
    // a fade next to other tracks is fine
    const moving = rect({
      animate: { x: animate.opacity },
      orbit: orbit({ fade: { from: 0, to: 1 } }),
    });
    expect(issues(withLayers([moving]))).toEqual([]);
  });

  test("the published schema describes the orbit with the shared ranges", () => {
    const defs = designJsonSchema["$defs"] as Record<string, Record<string, unknown>>;
    const properties = defs["Orbit"]?.["properties"] as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual([
      "center",
      "radius",
      "radiusY",
      "angle",
      "speed",
      "upright",
      "fade",
    ]);
    expect(defs["Orbit"]?.["additionalProperties"]).toBe(false);
  });
});

describe("a text layer's line cap (maxLines, RM-123)", () => {
  const text = (extra: Record<string, unknown>) => ({ type: "text", content: "a", ...extra });

  const issuesAt = (maxLines: unknown) => {
    const result = validateDesign({ ...base(), layers: [text({ maxLines })] });
    return result.ok ? [] : result.issues.filter((issue) => issue.path === "/layers/0/maxLines");
  };

  test.each([1, 1000, "{{ props.lines }}"])("%j is valid", (maxLines) => {
    expect(issuesAt(maxLines)).toEqual([]);
  });

  test.each([
    [0, "range"],
    [1.5, "type"],
    [1001, "range"],
    ["2", "type"],
  ])("%j is a %s issue at the property", (maxLines, code) => {
    expect(issuesAt(maxLines)).toMatchObject([{ code }]);
  });

  test("it is not a style property and not on other layers", () => {
    const result = issuesOf({
      ...base(),
      styles: { body: { maxLines: 2 } },
      layers: [rect({ maxLines: 2 })],
    });
    expect(result.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "/layers/0/maxLines", code: "unknown-property" },
      { path: "/styles/body/maxLines", code: "unknown-property" },
    ]);
  });
});
