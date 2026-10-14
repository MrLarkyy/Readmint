import { describe, expect, test } from "vitest";
import { DesignLimits, parseDesign } from "../src/index.js";
import { parseDesignSource } from "../src/parseDesignSource.js";

const minimalYaml = "version: 0\ncanvas: { width: 10, height: 10 }\nlayers: []\n";
const minimalJson = '{"version": 0, "canvas": {"width": 10, "height": 10}, "layers": []}';

function atStackDepth<T>(frames: number, run: () => T): T {
  return frames === 0 ? run() : atStackDepth(frames - 1, run);
}

function issuesOf(source: string, format?: "json" | "yaml") {
  const result = parseDesign(source, format === undefined ? {} : { format });
  if (result.ok) throw new Error("expected issues");
  return result.issues;
}

describe("JSON source", () => {
  test("a syntax error is a parse issue with line and column", () => {
    expect(issuesOf('{\n  "version": 0,\n  "canvas" x\n}')).toEqual([
      { path: "", code: "parse", message: "invalid JSON: expected ':'", line: 3, column: 12 },
    ]);
    expect(issuesOf('{"version": 0,')).toMatchObject([
      { code: "parse", message: "invalid JSON: unexpected end of input", line: 1, column: 15 },
    ]);
  });

  test("strict syntax: comments, trailing commas, single quotes and NaN are rejected", () => {
    for (const source of [
      '{"version": 0, // note\n}',
      '{"version": 0,}',
      "{'version': 0}",
      '{"version": NaN}',
      '{"version": 01}',
      '{"a": "tab\there"}',
    ])
      expect(issuesOf(source)[0]?.code, source).toBe("parse");
  });

  test("duplicate keys are reported, also when spelled with escapes", () => {
    expect(issuesOf('{"version": 0,\n "version": 0}')).toEqual([
      { path: "", code: "duplicate-key", message: 'duplicate key "version"', line: 2, column: 2 },
    ]);
    expect(issuesOf('{"a": 1, "\\u0061": 2}')).toMatchObject([{ code: "duplicate-key" }]);
  });

  test("deep nesting stops at the limit without a RangeError", () => {
    const deep = `${'{"a":'.repeat(10_000)}1${"}".repeat(10_000)}`;
    expect(issuesOf(deep)).toMatchObject([{ code: "too-deep", line: 1 }]);
    expect(issuesOf("[".repeat(10_000), "json")).toMatchObject([{ code: "too-deep" }]);
  });

  test("a byte order mark is accepted", () => {
    expect(parseDesign(`\ufeff${minimalJson}`).ok).toBe(true);
  });
});

describe("YAML source", () => {
  test("is read as YAML 1.2 core: yes stays a string", () => {
    const source = `${minimalYaml.replace("layers: []", "layers:")}  - { type: rect, width: 1, height: 1, visible: yes }\n`;
    expect(issuesOf(source)).toMatchObject([{ path: "/layers/0/visible", code: "type" }]);
    expect(parseDesignSource("a: yes\nb: on\nc: 012\n")).toEqual({
      ok: true,
      value: { a: "yes", b: "on", c: 12 },
    });
  });

  test("duplicate keys are reported with line and column, in document order", () => {
    expect(issuesOf("version: 0\nlayers: []\nversion: 0\n")).toEqual([
      { path: "", code: "duplicate-key", message: 'duplicate key "version"', line: 3, column: 1 },
    ]);
    expect(issuesOf("a:\n  b: 1\n  b: 2\nc: 1\nc: 2\n")).toMatchObject([
      { code: "duplicate-key", line: 3 },
      { code: "duplicate-key", line: 5 },
    ]);
  });

  test("a map with 80 000 keys is checked in linear time", () => {
    // A growth ratio instead of a wall-clock bound, so machine load does not decide: linear is
    // about 4 for 4x the keys, quadratic about 16; the best of three runs filters load spikes.
    const duplicateKeySource = (count: number) =>
      [...Array.from({ length: count }, (_, index) => `k${String(index)}: 0`), "k7: 1"].join("\n");
    const best = (source: string) => {
      let fastest = Infinity;
      for (let run = 0; run < 3; run++) {
        const started = performance.now();
        issuesOf(source);
        fastest = Math.min(fastest, performance.now() - started);
      }
      return fastest;
    };
    expect(issuesOf(duplicateKeySource(80_000))).toMatchObject([
      { code: "duplicate-key", line: 80_001, column: 1 },
    ]);
    expect(best(duplicateKeySource(80_000)) / best(duplicateKeySource(20_000))).toBeLessThan(8);
  });

  test("more than maxAliases aliases fail before any alias is resolved", () => {
    // As many anchors and aliases as fit in the YAML source limit.
    const count = 30_000;
    const anchors = Array.from(
      { length: count },
      (_, index) => `a${String(index)}: &x${String(index)} 0`,
    );
    const aliases = Array.from(
      { length: count },
      (_, index) => `b${String(index)}: *x${String(index)}`,
    );
    const source = [...anchors, ...aliases].join("\n");
    expect(source.length).toBeLessThanOrEqual(DesignLimits.maxYamlSourceLength);
    const started = performance.now();
    expect(issuesOf(source)).toEqual([
      expect.objectContaining({ code: "too-large", line: count + DesignLimits.maxAliases + 1 }),
    ]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("aliases within the limit resolve", () => {
    const source = `${minimalYaml}styles:\n  a: &card { opacity: 1 }\n  b: *card\n`;
    const result = parseDesign(source);
    expect(result.ok && result.value.styles).toEqual({ a: { opacity: 1 }, b: { opacity: 1 } });
  });

  test("an alias to no earlier anchor is a parse issue with line and column", () => {
    expect(issuesOf(`${minimalYaml}title: *nope\n`)).toEqual([
      { path: "", code: "parse", message: 'unknown YAML alias "nope"', line: 4, column: 8 },
    ]);
    expect(issuesOf(`${minimalYaml}title: *late\ndescription: &late x\n`)).toMatchObject([
      { code: "parse", line: 4 },
    ]);
  });

  // Linear shapes take 1-2 s locally; every super-linear one found took 9 s or more.
  const linearBudget = 8000;
  const aliasCount = DesignLimits.maxAliases - 2;
  const aliasedAnchors = {
    anchors: Array.from({ length: aliasCount }, (_, i) => `b${String(i)}: &b${String(i)} 0\n`).join(
      "",
    ),
    uses: `y: &a [${Array.from({ length: aliasCount }, (_, i) => `*b${String(i)}`).join(",")}]\nz: *a\n`,
  };

  function fillToYamlLimit(head: string, unit: string, tail = ""): string {
    const room = DesignLimits.maxYamlSourceLength - head.length - tail.length;
    const source = head + unit.repeat(Math.floor(room / unit.length)) + tail;
    expect(source.length).toBeGreaterThan(DesignLimits.maxYamlSourceLength - unit.length);
    expect(source.length).toBeLessThanOrEqual(DesignLimits.maxYamlSourceLength);
    return source;
  }

  test.each([
    [
      "dense flow sequence",
      `${minimalYaml}x: [0`,
      ",0",
      "]",
      { path: "/x", code: "unknown-property" },
    ],
    ["block sequence", `${minimalYaml}x:\n`, "- 0\n", "", { path: "/x", code: "unknown-property" }],
    [
      "list of layers",
      minimalYaml.replace("layers: []\n", "layers:\n"),
      "  - { type: rect, x: 1, y: 2, width: 10, height: 10, fill: '#fff' }\n",
      "",
      { code: "too-many-layers" },
    ],
  ])(
    "a YAML %s at the size limit is checked within seconds",
    (_, head, unit, tail, issue) => {
      const source = fillToYamlLimit(head, unit, tail);
      const started = performance.now();
      expect(issuesOf(source)[0]).toMatchObject(issue);
      expect(performance.now() - started).toBeLessThan(linearBudget);
    },
    30_000,
  );

  /**
   * Times a source against a linear twin: both warmed up once, then three rounds of the two back
   * to back, so a change in machine load hits both sides of each ratio alike.
   */
  function compareWithTwin<T>(
    run: () => T,
    twin: () => unknown,
  ): { ms: number; ratio: number; result: T } {
    let result = run();
    twin();
    const times: number[] = [];
    const ratios: number[] = [];
    for (let round = 0; round < 3; round++) {
      const started = performance.now();
      result = run();
      const middle = performance.now();
      twin();
      times.push(middle - started);
      ratios.push((middle - started) / (performance.now() - middle));
    }
    const median = (values: number[]) => values.sort((x, y) => x - y)[1] ?? 0;
    return { ms: median(times), ratio: median(ratios), result };
  }

  test("a YAML sequence beside an aliased anchor full of aliases costs no more than without the alias", () => {
    const head = `${minimalYaml}${aliasedAnchors.anchors}f: [0`;
    const aliased = fillToYamlLimit(head, ",0", `]\n${aliasedAnchors.uses}`);
    const plain = aliased.replace(/z: \*a\n$/u, "z: 0\n");
    expect(plain).not.toBe(aliased);
    const withAlias = compareWithTwin(
      () => issuesOf(aliased),
      () => issuesOf(plain),
    );
    expect(withAlias.result[0]).toMatchObject({
      path: "/b0",
      code: "unknown-property",
    });
    expect(withAlias.ms).toBeLessThan(linearBudget);
    // yaml's alias count walks the whole document per alias: 3x slower than the twin.
    expect(withAlias.ratio).toBeLessThan(1.5);
  }, 60_000);

  test("a YAML source of syntax errors at the size limit costs no more than valid YAML", () => {
    const errors = fillToYamlLimit("x: [", ",");
    const values = fillToYamlLimit("x: [0", ",0", "]");
    const broken = compareWithTwin(
      () => parseDesign(errors),
      () => parseDesign(values),
    );
    expect(broken.result).toMatchObject({ ok: false, truncated: true });
    expect(!broken.result.ok && broken.result.issues).toHaveLength(DesignLimits.maxIssues);
    expect(broken.ms).toBeLessThan(linearBudget);
    // A stack trace per syntax error made this 6-10x slower than the valid twin.
    expect(broken.ratio).toBeLessThan(2);
  }, 60_000);

  test("a YAML source over its limit fails before parsing", () => {
    const source = `${minimalYaml}x: [0${",0".repeat(DesignLimits.maxYamlSourceLength)}]`;
    const started = performance.now();
    expect(issuesOf(source)).toEqual([
      {
        path: "",
        code: "too-large",
        message: `the YAML source is longer than ${String(DesignLimits.maxYamlSourceLength)} characters`,
      },
    ]);
    expect(performance.now() - started).toBeLessThan(100);
  });

  test("a JSON source may exceed the YAML limit", () => {
    const padding = " ".repeat(DesignLimits.maxYamlSourceLength);
    expect(parseDesign(`${minimalJson}${padding}`).ok).toBe(true);
    expect(issuesOf(`${minimalJson}${padding}`, "yaml")).toMatchObject([{ code: "too-large" }]);
  });

  test("unknown and language-specific tags are rejected", () => {
    for (const tag of [
      "!!js/function 'f'",
      "!custom value",
      "!!binary aGk=",
      "!!timestamp 2020-01-01",
    ])
      expect(issuesOf(`${minimalYaml}title: ${tag}\n`), tag).toMatchObject([
        { code: "parse", message: "unknown YAML tag", line: 4 },
      ]);
  });

  test("core tags still work", () => {
    expect(parseDesignSource(["a: !!str 5", "b: !!int '7'"].join("\n"))).toEqual({
      ok: true,
      value: { a: "5", b: 7 },
    });
  });

  test("a multi-document stream is rejected", () => {
    expect(issuesOf(`${minimalYaml}---\n${minimalYaml}`)).toMatchObject([
      { code: "parse", line: 4 },
    ]);
  });

  test("merge keys are plain keys", () => {
    const source = `${minimalYaml}styles:\n  base: &base { opacity: 1 }\n  card: { <<: *base }\n`;
    expect(issuesOf(source)).toMatchObject([{ path: "/styles/card/<<", code: "unknown-property" }]);
  });

  test("an alias bomb fails fast", () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x"]',
      "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]",
      "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]",
      "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]",
      "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]",
      "f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e]",
      "g: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f]",
    ].join("\n");
    const started = performance.now();
    expect(issuesOf(bomb)).toMatchObject([{ code: "too-large" }]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a self-referencing alias ends as too-deep", () => {
    expect(
      issuesOf("version: 0\ncanvas: &c { width: 1, height: 1, more: [*c, *c] }\nlayers: []\n"),
    ).toMatchObject([{ code: "too-deep" }]);
  });

  test.each([
    ["flow sequences", "[".repeat(10_000), 65],
    ["block sequences", `${"- ".repeat(5000)}0`, 129],
    ["explicit keys", `${"? ".repeat(5000)}0`, 129],
    ["flow maps", `x: ${"{a: ".repeat(5000)}`, 256],
  ])("deep YAML %s fail at the same place on every call and stack depth", (_, source, column) => {
    const expected = [
      {
        path: "",
        code: "too-deep",
        message: `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`,
        line: 1,
        column,
      },
    ];
    for (let call = 0; call < 3; call++) expect(issuesOf(source)).toEqual(expected);
    expect(atStackDepth(2000, () => issuesOf(source))).toEqual(expected);
  });

  test("YAML nested exactly to the limit is accepted", () => {
    const depth = DesignLimits.maxDepth - 1;
    const nested = `${"[".repeat(depth)}${"]".repeat(depth)}`;
    expect(issuesOf(`${minimalYaml}x: ${nested}\n`)).toMatchObject([
      { path: "/x", code: "unknown-property" },
    ]);
    expect(issuesOf(`${minimalYaml}x: [${nested}]\n`)).toMatchObject([{ code: "too-deep" }]);
  });

  test("a read-only Error.stackTraceLimit is left alone", () => {
    const saved = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
    if (saved === undefined) return;
    Object.defineProperty(Error, "stackTraceLimit", { ...saved, writable: false });
    try {
      expect(parseDesign(minimalYaml).ok).toBe(true);
      expect(issuesOf("x: [,]")).toMatchObject([{ code: "parse" }]);
    } finally {
      Object.defineProperty(Error, "stackTraceLimit", saved);
    }
  });

  test("non-string keys are rejected", () => {
    expect(issuesOf("? [a, b]\n: c\n")).toMatchObject([{ code: "parse" }]);
  });

  test("a byte order mark is accepted", () => {
    expect(parseDesign(`\ufeff${minimalYaml}`).ok).toBe(true);
  });
});

describe("format choice and limits", () => {
  test("auto-detects JSON by a leading brace and YAML otherwise", () => {
    expect(parseDesign(`  \n${minimalJson}`).ok).toBe(true);
    expect(parseDesign(minimalYaml).ok).toBe(true);
    const flowYaml = "{version: 0, canvas: {width: 1, height: 1}, layers: []}";
    expect(parseDesign(flowYaml).ok).toBe(false);
    expect(parseDesign(flowYaml, { format: "yaml" }).ok).toBe(true);
  });

  test("an oversized source fails before parsing", () => {
    const source = `{${" ".repeat(DesignLimits.maxSourceLength)}`;
    expect(issuesOf(source)).toEqual([expect.objectContaining({ path: "", code: "too-large" })]);
  });

  test("an empty source or a scalar root is not a design", () => {
    expect(issuesOf("")).toMatchObject([{ path: "", code: "type" }]);
    expect(issuesOf("just text")).toMatchObject([{ path: "", code: "type" }]);
  });

  test("parse messages never echo a long input", () => {
    const long = "Q".repeat(5000);
    for (const source of [`{"${long}": 1, "${long}": 2}`, `{"a": ${long}}`, `a: !${long} x\n`])
      for (const issue of issuesOf(source)) expect(issue.message).not.toMatch(/Q{65}/u);
  });
});
