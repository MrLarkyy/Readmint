import { applyDesignProps } from "@readmint/format";
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

function render(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme,
  props: Record<string, string>,
  data = sampleProfileData(),
): string {
  const applied = applyDesignProps(loadProfile(template, section, theme), props);
  if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
  return renderProfile({ template, design: applied.value, data });
}

const position = (svg: string, name: string): number => svg.indexOf(name);

describe.each(cases)("%s %s languageShare", (template, section) => {
  test.each(themes)("the default is bytes and renders as the explicit bytes, %s", (theme) => {
    const plain = render(template, section, theme, {});
    expect(render(template, section, theme, { languageShare: "bytes" })).toBe(plain);
    const { github } = sampleProfileData();
    expect(github.languages[0]?.name).toBe("TypeScript");
    expect(github.languagesByRepo[0]?.name).toBe("Python");
    expect(position(plain, "TypeScript")).toBeGreaterThan(-1);
    expect(position(plain, "TypeScript")).toBeLessThan(position(plain, "Python"));
  });

  test.each(themes)("repositories draws the repository weighting first, %s", (theme) => {
    const svg = render(template, section, theme, { languageShare: "repositories" });
    expect(position(svg, "Python")).toBeGreaterThan(-1);
    expect(position(svg, "Python")).toBeLessThan(position(svg, "TypeScript"));
    expect(svg).not.toBe(render(template, section, theme, {}));
  });

  test.each(themes)("repositories without languagesByRepo draws the bytes list, %s", (theme) => {
    const older = Object.fromEntries(
      Object.entries(sampleProfileData().github).filter(([key]) => key !== "languagesByRepo"),
    );
    const svg = render(template, section, theme, { languageShare: "repositories" }, {
      github: older,
    } as never);
    expect(svg).toBe(render(template, section, theme, {}));
  });
});
