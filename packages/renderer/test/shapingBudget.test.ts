import type { Design, FontAsset } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { coverage, layoutTable, struct } from "../../fonts/test/buildLayoutTables.js";
import { buildTestFont } from "../../fonts/test/buildTestFont.js";
import { renderSvg } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const chars = (...codes: number[]) => String.fromCharCode(...codes);

/**
 * Review probes r1 and r2: letters a-z, and a ligature set on `a` of `count` entries that never match (every offset
 * is 2, so each entry reads the offset array itself as a ligature of a and b). Each entry costs some two operations:
 * 15000 make a word cost what a shaping call once got for itself, 7000 keep a short text just under its own budget.
 */
function hostileFont(count = 15_000): Uint8Array {
  const set = new Uint8Array(2 + count * 2);
  const view = new DataView(set.buffer);
  view.setUint16(0, count);
  for (let index = 0; index < count; index++) view.setUint16(2 + index * 2, 2);
  const ligatures = struct([1, { offset: coverage([1]) }, 1, { offset: set }]);
  return buildTestFont({
    family: "Hostile",
    glyphs: [
      { advance: 500 },
      ...Array.from({ length: 26 }, (_, index) => ({ codePoints: [0x61 + index], advance: 500 })),
    ],
    tables: {
      GSUB: layoutTable([{ tag: "liga", lookups: [0] }], [{ type: 4, subtables: [ligatures] }]),
    },
  });
}

function render(content: string, fonts: Record<string, FontAsset>, supplied = {}) {
  const design: Design = {
    version: 0,
    canvas: { width: 400, height: 100 },
    assets: { fonts },
    layers: [{ type: "text", content: "{{text}}", width: 380, font: "f" }],
  };
  const started = performance.now();
  const result = renderSvg(design, { data: { text: content }, assets: { fonts: supplied } });
  return { result, ms: performance.now() - started };
}

describe("one shaping budget per text", () => {
  test("distinct words in a hostile font spend the text's budget together: asset-format well under a second", () => {
    const letters = "cdefghijklmnopqrstuvwxyz";
    const words: string[] = [];
    for (let first = 0; words.length < 600; first++) {
      for (const second of letters) {
        words.push(`a${letters[first % letters.length] ?? "c"}${second}`);
      }
    }
    const { result, ms } = render(
      words.join(" "),
      { f: { family: "Hostile", src: "hostile.ttf", licence: { embedding: "allowed" } } },
      { f: hostileFont() },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "asset-format", path: "/assets/fonts/f/src" }],
    });
    expect(ms).toBeLessThan(1000 * loadScale());
  });

  test.each([
    [
      "a Latin letter with 150 acute accents",
      fontAssets.medium,
      `Hello a${chars(0x301).repeat(150)} world`,
    ],
    [
      "Arabic beh with 100 shadda and fatha pairs",
      fontAssets.naskh,
      `${chars(0x628)}${chars(0x651, 0x64e).repeat(100)}`,
    ],
    [
      "3000 Devanagari ka and virama pairs",
      fontAssets.devanagari,
      chars(0x915, 0x94d).repeat(3000),
    ],
    ["a Latin letter with 5000 acute accents", fontAssets.medium, `a${chars(0x301).repeat(5000)}`],
  ] as const)("%s renders, as font and as paths, in bounded time", (_name, font, content) => {
    for (const drawAs of ["font", "paths"] as const) {
      const { result, ms } = render(content, { f: { ...font, drawAs } });
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      expect(ms).toBeLessThan(1000 * loadScale());
    }
  });
});

describe("one shaping bound for the whole render", () => {
  test("2000 short texts, each just under its own budget in a costly font, fail as asset-too-large well under a second", () => {
    const letters = "cdefghijklmnopqrstuvwxyz";
    const texts: string[] = [];
    for (let index = 0; texts.length < 2000; index++) {
      const pick = (shift: number) =>
        letters[Math.floor(index / letters.length ** shift) % letters.length] ?? "c";
      texts.push(`a${pick(0)}${pick(1)}${pick(2)}${pick(3)}`);
    }
    const design: Design = {
      version: 0,
      canvas: { width: 400, height: 100 },
      assets: {
        fonts: { f: { family: "Hostile", src: "hostile.ttf", licence: { embedding: "allowed" } } },
      },
      layers: texts.map((content) => ({ type: "text" as const, content, font: "f" })),
    };
    const started = performance.now();
    const result = renderSvg(design, { assets: { fonts: { f: hostileFont(7000) } } });
    const ms = performance.now() - started;
    expect(result.ok).toBe(false);
    const issue = result.ok ? undefined : result.issues[0];
    expect(issue?.code).toBe("asset-too-large");
    expect(issue?.path).toMatch(/^\/layers\/\d+\/content$/u);
    expect(issue?.message).toContain("shaping operations (all texts together)");
    expect(Number(/\/layers\/(\d+)/u.exec(issue?.path ?? "")?.[1])).toBeGreaterThan(100);
    expect(ms).toBeLessThan(1000 * loadScale());
  });
});

describe("measured text shares the render's shaping bound", () => {
  test("2000 distinct textWidth calls in a costly font fail as asset-too-large at the expression well under a second", () => {
    const letters = "cdefghijklmnopqrstuvwxyz";
    const texts: string[] = [];
    for (let index = 0; texts.length < 2000; index++) {
      const pick = (shift: number) =>
        letters[Math.floor(index / letters.length ** shift) % letters.length] ?? "c";
      texts.push(`a${pick(0)}${pick(1)}${pick(2)}${pick(3)}`);
    }
    const design: Design = {
      version: 0,
      canvas: { width: 400, height: 100 },
      assets: {
        fonts: { f: { family: "Hostile", src: "hostile.ttf", licence: { embedding: "allowed" } } },
      },
      layers: [
        {
          type: "rect",
          width: '{{ t | textWidth("f", 16) }}',
          height: 1,
          repeat: { each: "{{ texts }}", as: "t" },
        },
      ],
    };
    const started = performance.now();
    const result = renderSvg(design, {
      data: { texts },
      assets: { fonts: { f: hostileFont(7000) } },
    });
    const ms = performance.now() - started;
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "asset-too-large", path: "/layers/0/width" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain(
      "shaping operations (all texts together)",
    );
    expect(ms).toBeLessThan(1000 * loadScale());
  });
});
