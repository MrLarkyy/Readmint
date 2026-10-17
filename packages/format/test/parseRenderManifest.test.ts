import { expect, test } from "vitest";
import { parseRenderManifest, RenderManifestLimits, renderVariant } from "../src/index.js";

const sentinel = "V4LUE-SENTINEL";

function issues(source: string) {
  const result = parseRenderManifest(source);
  if (result.ok) throw new Error("expected a failure");
  return result.issues;
}

function manifest(renders: unknown): string {
  return JSON.stringify({ renders });
}

test("reads renders with props and variants, in order", () => {
  const result = parseRenderManifest(
    JSON.stringify({
      $schema: "https://example.test/renders-v0.schema.json",
      renders: [
        {
          name: "repo-1",
          design: "repo.json",
          props: { slot: 0, tags: ["a", 1] },
          variants: ["dark"],
        },
        { name: "header", design: "sub/header.yaml", variants: [] },
        { name: "plain", design: "plain.yml" },
      ],
    }),
  );
  expect(result).toEqual({
    ok: true,
    value: {
      renders: [
        {
          name: "repo-1",
          design: "repo.json",
          props: { slot: 0, tags: ["a", 1] },
          variants: [renderVariant("dark")],
        },
        { name: "header", design: "sub/header.yaml", props: {}, variants: [] },
        { name: "plain", design: "plain.yml", props: {} },
      ],
    },
  });
});

test("a leading byte order mark is ignored", () => {
  expect(parseRenderManifest(`\ufeff${manifest([{ name: "a", design: "a.json" }])}`).ok).toBe(true);
});

test.each([["[]"], ['"text"'], ["null"]])("the root %s is not an object", (source) => {
  expect(issues(source)).toMatchObject([{ path: "", code: "type" }]);
});

test("renders is required, a list and not empty", () => {
  expect(issues("{}")).toMatchObject([{ path: "/renders", code: "missing-property" }]);
  expect(issues('{"renders":3}')).toMatchObject([{ path: "/renders", code: "type" }]);
  expect(issues('{"renders":[]}')).toMatchObject([{ path: "/renders", code: "count" }]);
});

test("unknown keys are refused at the root and in an entry", () => {
  expect(issues('{"renders":[{"name":"a","design":"a.json"}],"version":1}')).toMatchObject([
    { path: "/version", code: "unknown-property" },
  ]);
  expect(issues(manifest([{ name: "a", design: "a.json", extra: 1 }]))).toMatchObject([
    { path: "/renders/0/extra", code: "unknown-property" },
  ]);
});

test("a name is an id", () => {
  expect(issues(manifest([{ name: "1a", design: "a.json" }]))).toMatchObject([
    { path: "/renders/0/name", code: "pattern" },
  ]);
  expect(issues(manifest([{ design: "a.json" }]))).toMatchObject([
    { path: "/renders/0/name", code: "missing-property" },
  ]);
  expect(issues(manifest([{ name: 3, design: "a.json" }]))).toMatchObject([
    { path: "/renders/0/name", code: "type" },
  ]);
});

test.each([["CON"], ["nul"], ["lpt1"], ["Aux"], ["com9"]])(
  "the Windows device name %s is refused as a name",
  (name) => {
    expect(issues(manifest([{ name, design: "a.json" }]))).toMatchObject([
      { path: "/renders/0/name", code: "pattern" },
    ]);
  },
);

test("a name used twice is refused at the second, letter case ignored", () => {
  expect(
    issues(
      manifest([
        { name: "repo", design: "a.json" },
        { name: "Repo", design: "b.json" },
      ]),
    ),
  ).toMatchObject([{ path: "/renders/1/name", code: "duplicate-name" }]);
});

test.each([
  ["/abs.json"],
  ["C:/x.json"],
  ["../x.json"],
  ["a/../x.json"],
  ["a//x.json"],
  ["./x.json"],
  ["a\\x.json"],
  ["x.txt"],
  ["x.json "],
  ["con.json"],
  ["a/nul/x.json"],
  [""],
  ["a\u0001.json"],
])("the design %j is refused", (design) => {
  expect(issues(manifest([{ name: "a", design }]))).toMatchObject([
    { path: "/renders/0/design", code: "pattern" },
  ]);
});

test("a design is required and a string", () => {
  expect(issues(manifest([{ name: "a" }]))).toMatchObject([
    { path: "/renders/0/design", code: "missing-property" },
  ]);
  expect(issues(manifest([{ name: "a", design: 1 }]))).toMatchObject([
    { path: "/renders/0/design", code: "type" },
  ]);
});

test("variants: an unknown one is an enum issue, a repeated one a duplicate", () => {
  expect(issues(manifest([{ name: "a", design: "a.json", variants: ["night"] }]))).toMatchObject([
    { path: "/renders/0/variants/0", code: "enum" },
  ]);
  expect(
    issues(manifest([{ name: "a", design: "a.json", variants: ["dark", "dark"] }])),
  ).toMatchObject([{ path: "/renders/0/variants/1", code: "duplicate-name" }]);
  expect(issues(manifest([{ name: "a", design: "a.json", variants: "dark" }]))).toMatchObject([
    { path: "/renders/0/variants", code: "type" },
  ]);
});

test("a prop a listed variant also sets is a duplicate-key", () => {
  expect(
    issues(manifest([{ name: "a", design: "a.json", props: { theme: "x" }, variants: ["dark"] }])),
  ).toMatchObject([{ path: "/renders/0/props/theme", code: "duplicate-key" }]);
  expect(
    parseRenderManifest(
      manifest([{ name: "a", design: "a.json", props: { theme: "x" }, variants: [] }]),
    ).ok,
  ).toBe(true);
  expect(
    parseRenderManifest(manifest([{ name: "a", design: "a.json", props: { theme: "x" } }])).ok,
  ).toBe(true);
});

test("prop values are scalars or lists of scalars", () => {
  expect(issues(manifest([{ name: "a", design: "a.json", props: { p: { q: 1 } } }]))).toMatchObject(
    [{ path: "/renders/0/props/p", code: "type" }],
  );
  expect(issues(manifest([{ name: "a", design: "a.json", props: { p: null } }]))).toMatchObject([
    { path: "/renders/0/props/p", code: "type" },
  ]);
  expect(issues(manifest([{ name: "a", design: "a.json", props: { p: [[1]] } }]))).toMatchObject([
    { path: "/renders/0/props/p", code: "type" },
  ]);
  expect(issues(manifest([{ name: "a", design: "a.json", props: [] }]))).toMatchObject([
    { path: "/renders/0/props", code: "type" },
  ]);
});

test.each([["__proto__"], ["1a"], ["a b"]])("the prop key %s is refused", (key) => {
  const source = `{"renders":[{"name":"a","design":"a.json","props":{${JSON.stringify(key)}:1}}]}`;
  expect(issues(source)).toMatchObject([{ code: "pattern" }]);
});

test("__proto__ and constructor are plain data, never prototype access", () => {
  const result = parseRenderManifest(
    '{"renders":[{"name":"constructor","design":"a.json","props":{"constructor":"x"}}]}',
  );
  if (!result.ok) throw new Error("expected success");
  const [entry] = result.value.renders;
  expect(entry?.name).toBe("constructor");
  expect(Object.getPrototypeOf(entry?.props)).toBeNull();
  expect(entry?.props["constructor"]).toBe("x");
  expect(issues(manifest([{ name: "__proto__", design: "a.json" }]))).toMatchObject([
    { path: "/renders/0/name", code: "pattern" },
  ]);
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
});

test("limits: source, renders, props, props length", () => {
  const long = " ".repeat(RenderManifestLimits.maxSourceLength + 1);
  expect(issues(long)).toMatchObject([{ path: "", code: "too-large" }]);
  const many = Array.from({ length: RenderManifestLimits.maxRenders + 1 }, (_, index) => ({
    name: `r${String(index)}`,
    design: "a.json",
  }));
  expect(issues(manifest(many))).toMatchObject([{ path: "/renders", code: "count" }]);
  expect(parseRenderManifest(manifest(many.slice(0, RenderManifestLimits.maxRenders))).ok).toBe(
    true,
  );
  const props = Object.fromEntries(
    Array.from({ length: RenderManifestLimits.maxPropsPerRender + 1 }, (_, index) => [
      `p${String(index)}`,
      1,
    ]),
  );
  expect(issues(manifest([{ name: "a", design: "a.json", props }]))).toMatchObject([
    { path: "/renders/0/props", code: "count" },
  ]);
  const wide = { text: "x".repeat(RenderManifestLimits.maxPropsLength) };
  expect(issues(manifest([{ name: "a", design: "a.json", props: wide }]))).toMatchObject([
    { path: "/renders/0/props", code: "too-large" },
  ]);
});

test("a parse error carries the location", () => {
  expect(issues("{")).toMatchObject([{ code: "parse", line: 1 }]);
});

test("no message quotes a value", () => {
  const sources = [
    manifest([{ name: "a", design: "a.json", props: { p: { q: sentinel, n: 7319 } } }]),
    manifest([{ name: "a", design: "a.json", props: { theme: sentinel }, variants: ["dark"] }]),
    manifest([{ name: "a", design: "a.json", props: { p: [sentinel, [7319]] } }]),
    manifest([{ name: "a", design: "a.json", props: { "bad key": sentinel, p: 7319 } }]),
    manifest([{ name: `${sentinel} x`, design: "a.json" }]),
    manifest([{ name: "a", design: `${sentinel}.txt`, variants: [sentinel] }]),
  ];
  for (const source of sources) {
    const text = JSON.stringify(issues(source));
    expect(text).not.toContain(sentinel);
    expect(text).not.toContain("7319");
  }
});
