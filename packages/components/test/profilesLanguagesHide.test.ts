import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyDesignProps, parseDesignProps, type ComponentPropValue } from "@readmint/format";
import { describe, expect, test } from "vitest";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { loadProfile, renderProfile, type ProfileTheme } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

const cases: readonly (readonly [ProfileTemplate, ProfileSection])[] = [
  ["year-ring", "index"],
  ["horizon", "stack"],
  ["pinscreen", "stack"],
];
const themes: readonly ProfileTheme[] = ["light", "dark"];
const folders = join(import.meta.dirname, "..", "templates", "profiles");

type Language = { readonly name: string; readonly share: number };

/** The sample data with `languages` as its bytes list (`languageShare` stays at its default, bytes). */
function withLanguages(languages: readonly Language[]) {
  const { github } = sampleProfileData();
  return {
    github: {
      ...github,
      languages: languages.map((language) => ({
        ...language,
        color: "#3178c6",
        bytes: Math.round(language.share * 1_000_000),
      })),
    },
  };
}

const five: readonly Language[] = [
  { name: "TypeScript", share: 0.4 },
  { name: "Kotlin", share: 0.3 },
  { name: "Java", share: 0.15 },
  { name: "Go", share: 0.1 },
  { name: "Shell", share: 0.05 },
];

function render(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme,
  props: Readonly<Record<string, ComponentPropValue>>,
  data: Readonly<Record<string, unknown>> = withLanguages(five),
): string {
  const applied = applyDesignProps(loadProfile(template, section, theme), props);
  if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
  return renderProfile({ template, design: applied.value, data });
}

/** The rows a section draws: three in the year-ring and horizon, four in the pinscreen panel. */
const drawnRows = (template: ProfileTemplate): number => (template === "pinscreen" ? 4 : 3);

/** A share as the section writes it: whole percent, or one decimal in the pinscreen panel. */
function written(template: ProfileTemplate, share: number): string {
  return template === "pinscreen"
    ? `${(share * 100).toFixed(1)}%`
    : `${String(Math.round(share * 100))}%`;
}

/** The share texts of the drawn rows, each kept share over the sum of the kept shares. */
function expectedShares(template: ProfileTemplate, hidden: readonly string[]): string[] {
  const kept = five.filter((language) => !hidden.includes(language.name));
  const total = kept.reduce((sum, language) => sum + language.share, 0);
  return kept
    .slice(0, drawnRows(template))
    .map((language) => written(template, language.share / total));
}

/** Every percentage the SVG writes, in document order. */
const percentages = (svg: string): string[] =>
  [...svg.matchAll(/(\d+(?:\.\d)?%)</g)].map((match) => match[1] ?? "");

describe.each(cases)("%s %s languagesHide", (template, section) => {
  test.each(themes)(
    "drops a hidden language and recomputes the shares of the rest, %s",
    (theme) => {
      const plain = render(template, section, theme, {});
      expect(plain).toContain("TypeScript");
      expect(percentages(plain)).toEqual(expectedShares(template, []));
      const svg = render(template, section, theme, { languagesHide: ["TypeScript"] });
      expect(svg).not.toContain("TypeScript");
      expect(percentages(svg)).toEqual(expectedShares(template, ["TypeScript"]));
      expect(svg.indexOf("Kotlin")).toBeLessThan(svg.indexOf("Java"));
    },
  );

  test.each(themes)("hides several names, wherever they rank, %s", (theme) => {
    const svg = render(template, section, theme, { languagesHide: ["Java", "TypeScript"] });
    expect(svg).not.toContain("TypeScript");
    expect(svg).not.toContain("Java");
    expect(percentages(svg)).toEqual(expectedShares(template, ["Java", "TypeScript"]));
  });

  test.each(themes)("a language hidden below the drawn rows still rescales them, %s", (theme) => {
    const plain = render(template, section, theme, {});
    expect(percentages(plain)).not.toContain(written(template, 0.05));
    const svg = render(template, section, theme, { languagesHide: ["Shell"] });
    expect(percentages(svg)).toEqual(expectedShares(template, ["Shell"]));
    expect(percentages(svg)).not.toEqual(percentages(plain));
  });

  test.each(themes)("draws exactly what data without the hidden language draws, %s", (theme) => {
    // Shares whose rescale is exact in binary, so the two renders can match byte for byte.
    const full = withLanguages([
      { name: "TypeScript", share: 0.5 },
      { name: "Kotlin", share: 0.25 },
      { name: "Java", share: 0.125 },
      { name: "Go", share: 0.125 },
    ]);
    const rest = withLanguages([
      { name: "Kotlin", share: 0.5 },
      { name: "Java", share: 0.25 },
      { name: "Go", share: 0.25 },
    ]);
    const hidden = render(template, section, theme, { languagesHide: ["TypeScript"] }, full);
    expect(hidden).toBe(render(template, section, theme, {}, rest));
  });

  test.each(themes)(
    "an empty list, an unknown name or another case changes nothing, %s",
    (theme) => {
      const plain = render(template, section, theme, {});
      for (const languagesHide of [[], ["Brainfuck"], ["typescript", "TYPESCRIPT"], [""]]) {
        expect(
          render(template, section, theme, { languagesHide }),
          JSON.stringify(languagesHide),
        ).toBe(plain);
      }
    },
  );

  test.each(themes)("every language hidden draws as data without languages, %s", (theme) => {
    const svg = render(template, section, theme, { languagesHide: five.map((l) => l.name) });
    expect(svg).toBe(render(template, section, theme, {}, withLanguages([])));
    expect(percentages(svg)).toEqual([]);
  });

  test.each(themes)("hides by the name of the selected share list, %s", (theme) => {
    const data = withLanguages(five);
    const byRepo = [
      { name: "Python", color: null, share: 0.6, repositories: 3 },
      { name: "TypeScript", color: null, share: 0.4, repositories: 2 },
    ];
    const svg = render(
      template,
      section,
      theme,
      { languageShare: "repositories", languagesHide: ["TypeScript"] },
      { github: { ...data.github, languagesByRepo: byRepo } },
    );
    expect(svg).not.toContain("TypeScript");
    expect(percentages(svg)).toEqual([written(template, 1)]);
  });

  test.each(themes)("takes the prop from the settings file, %s", (theme) => {
    const file = JSON.parse(
      readFileSync(join(folders, template, "settings.json"), "utf8"),
    ) as Record<string, Record<string, unknown>>;
    expect(file[section]?.["languagesHide"]).toEqual([]);
    const settings = parseDesignProps(
      JSON.stringify({ ...file, [section]: { ...file[section], languagesHide: ["TypeScript"] } }),
    );
    if (!settings.ok) throw new Error(JSON.stringify(settings.issues));
    const svg = render(template, section, theme, settings.value[section] ?? {});
    expect(svg).not.toContain("TypeScript");
    expect(percentages(svg)).toEqual(expectedShares(template, ["TypeScript"]));
  });
});
