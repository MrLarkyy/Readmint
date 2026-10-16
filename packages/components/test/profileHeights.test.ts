import { applyDesignProps, type ComponentPropValue } from "@readmint/format";
import { renderSvg, type LayerBox } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { loadProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

type Props = Readonly<Record<string, ComponentPropValue>>;

interface Sized {
  readonly svg: string;
  readonly height: number;
  readonly boxes: readonly LayerBox[];
}

/** A section with `props` set as a settings file sets them, on the sample with only its first `languages` languages. */
function renderSized(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme,
  props: Props,
  languages: number,
): Sized {
  const loaded = loadProfile(template, section, theme);
  const applied = applyDesignProps(loaded, props);
  if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
  const design = applied.value;
  const sample = sampleProfileData();
  expect(sample.github.languages.length).toBeGreaterThanOrEqual(languages);
  const data = {
    github: { ...sample.github, languages: sample.github.languages.slice(0, languages) },
  };
  const result = renderSvg(design, {
    data,
    assets: { fonts: profileFontAssets(template, design) },
    time: 0,
    layerBoxes: true,
  });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  const height = Number(/^<svg [^>]*\bheight="([^"]*)"/.exec(result.svg)?.[1]);
  return { svg: result.svg, height, boxes: result.layerBoxes ?? [] };
}

const bottom = (box: LayerBox) => box.y + box.height;
const words = (count: number, word: string) =>
  Array.from({ length: count }, (_, index) => `${word} ${String(index + 1)}`);

/** Light and dark twin: equal heights, which are returned with the light render. */
function renderTwins(
  template: ProfileTemplate,
  section: ProfileSection,
  props: Props,
  languages: number,
): Sized {
  const light = renderSized(template, section, "light", props, languages);
  const dark = renderSized(template, section, "dark", props, languages);
  expect(dark.height).toBe(light.height);
  return light;
}

describe("year-ring index: the canvas follows its rows", () => {
  const cases = [0, 1, 7, 8, 10].flatMap((labels) =>
    [0, 3].map((languages) => [labels, languages]),
  );
  test.each(cases)("%i labels, %i languages", (labels, languages) => {
    const props = { labels: words(labels, "label"), values: words(labels, "value") };
    const { height, boxes } = renderTwins("year-ring", "index", props, languages);
    const rows = Math.min(labels + (languages > 0 ? 1 : 0), 8);
    expect(height).toBe(39 + 36 * rows);
    const rules = boxes.filter((box) => box.height === 1 && box.width >= 840);
    expect(rules.length).toBe(rows + 1);
    expect(Math.max(...rules.map(bottom))).toBe(height - 4);
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test.each([
    [8, 8],
    [10, 9],
    [7, 8],
  ])("%i labels with the Languages row after %i: never drawn past the 8th row", (labels, after) => {
    const props = {
      labels: words(labels, "label"),
      values: words(labels, "value"),
      languagesAfter: after,
    };
    const { height, boxes } = renderTwins("year-ring", "index", props, 3);
    expect(height).toBe(327);
    const rules = boxes.filter((box) => box.height === 1 && box.width >= 840);
    expect(rules.length).toBe(9);
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test("8 rows is the tallest index, 327", () => {
    const props = { labels: words(12, "label"), values: words(12, "value") };
    expect(renderTwins("year-ring", "index", props, 3).height).toBe(327);
  });
});

const logoNames = words(7, "logo");
const logos = logoNames.map(() => "M0 0h14v14H0Z");
const lineOf = (index: number) => String(Math.min(index, 3));
const cardOf = (lines: number): Props => ({
  logoNames,
  logos,
  logoLabels: words(lines, "caption"),
  logoLines: logoNames.map((_, index) => lineOf(index)),
});
const squares = (boxes: readonly LayerBox[]) =>
  boxes.filter((box) => box.width === 14 && box.height === 14);

describe("year-ring index: the business card of logos", () => {
  const rows = { labels: words(8, "label"), values: words(8, "value"), logosRow: 3 };

  test.each([1, 2, 3, 4])("%i card lines make the canvas 327 + 24 per extra line", (lines) => {
    const { height, boxes } = renderTwins("year-ring", "index", { ...rows, ...cardOf(lines) }, 3);
    expect(height).toBe(327 + 24 * (lines - 1));
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test("8 rows with 4 card lines make the tallest index, 399", () => {
    expect(renderTwins("year-ring", "index", { ...rows, ...cardOf(4) }, 3).height).toBe(399);
  });

  test.each([[[]], [[""]]])("captions %j count as one card line", (labels) => {
    const one = renderTwins("year-ring", "index", { ...rows, ...cardOf(1) }, 3).height;
    const props = { ...rows, ...cardOf(1), logoLabels: labels };
    expect(renderTwins("year-ring", "index", props, 3).height).toBe(one);
  });

  test("more than 4 captions count as 4 lines", () => {
    const props = { ...rows, ...cardOf(4), logoLabels: words(6, "caption") };
    expect(renderTwins("year-ring", "index", props, 3).height).toBe(399);
  });

  test("a row the 8-row cap hides draws no card and adds no height", () => {
    const hidden = { ...rows, ...cardOf(4), logosRow: 7 };
    expect(renderTwins("year-ring", "index", hidden, 3).height).toBe(327);
  });

  test("a hidden, fractional or negative row renders as -1", () => {
    const props = { ...rows, ...cardOf(4) };
    const off = renderSized("year-ring", "index", "light", { ...props, logosRow: -1 }, 3).svg;
    for (const logosRow of [7, 2.5, 8, -2]) {
      const shown = renderSized("year-ring", "index", "light", { ...props, logosRow }, 3).svg;
      expect(shown, String(logosRow)).toBe(off);
    }
  });
});

describe("pinscreen stack: the business card of logos", () => {
  const notes = {
    plugin: 'kotlin("jvm")',
    labels: words(4, "group"),
    items: words(4, "item"),
    noteLabels: words(3, "note"),
    noteItems: words(3, "text"),
    logosRow: 1,
  };

  test.each([1, 2, 3, 4])("%i card lines add %i code lines to 15", (lines) => {
    const { height, boxes } = renderTwins("pinscreen", "stack", { ...notes, ...cardOf(lines) }, 4);
    expect(height).toBe(96 + 20 * (15 + lines));
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test("4 card lines make the tallest stack, 476", () => {
    expect(renderTwins("pinscreen", "stack", { ...notes, ...cardOf(4) }, 4).height).toBe(476);
  });

  test("a fractional, out of range or negative row renders as -1", () => {
    const props = { ...notes, ...cardOf(4) };
    const off = renderSized("pinscreen", "stack", "light", { ...props, logosRow: -1 }, 4);
    expect(off.height).toBe(396);
    expect(squares(off.boxes)).toHaveLength(0);
    for (const logosRow of [1.5, 3, -2]) {
      const shown = renderSized("pinscreen", "stack", "light", { ...props, logosRow }, 4);
      expect(shown.svg, String(logosRow)).toBe(off.svg);
    }
  });
});

describe("pinscreen stack: the canvas follows its code lines and languages", () => {
  const fifteen = {
    plugin: 'kotlin("jvm")',
    labels: words(4, "group"),
    items: words(4, "item"),
    noteLabels: words(3, "note"),
    noteItems: words(3, "text"),
  };
  const lineCases: readonly (readonly [number, Props])[] = [
    [1, {}],
    [5, { plugin: 'kotlin("jvm")' }],
    [8, { labels: words(4, "group"), items: words(4, "item") }],
    [15, fifteen],
  ];
  const cases = lineCases.flatMap(([lines, props]) =>
    [0, 1, 2, 3, 4].map((languages) => [lines, languages, props] as const),
  );
  test.each(cases)("%i code lines, %i languages", (lines, languages, props) => {
    const { height, boxes } = renderTwins("pinscreen", "stack", props, languages);
    expect(height).toBe(Math.max(96 + 20 * lines, 132 + 36 * languages));
    const frame = boxes.filter((box) => box.width === 839);
    expect(frame.map((box) => box.height)).toEqual([height - 41]);
    const panel = boxes.filter((box) => box.width === 1 && box.x === 620);
    expect(panel.map((box) => box.height)).toEqual([height - 112]);
    const panelEnd = 92 + height - 112;
    for (const box of boxes) {
      expect(bottom(box)).toBeLessThanOrEqual(height);
      if (box.x >= 640)
        expect(bottom(box), "a language row inside the panel").toBeLessThanOrEqual(panelEnd);
    }
  });

  test("15 lines is the tallest stack, 396, with every language", () => {
    expect(renderTwins("pinscreen", "stack", fifteen, 4).height).toBe(396);
  });
});
