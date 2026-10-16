import { applyDesignProps, type ComponentPropValue } from "@readmint/format";
import { renderSvg, type LayerBox } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { loadProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

type Props = Readonly<Record<string, ComponentPropValue>>;

interface Sized {
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
  return { height, boxes: result.layerBoxes ?? [] };
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

  test("8 rows is the tallest index, 327", () => {
    const props = { labels: words(12, "label"), values: words(12, "value") };
    expect(renderTwins("year-ring", "index", props, 3).height).toBe(327);
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
