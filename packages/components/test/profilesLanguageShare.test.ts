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

  test.each(themes)("authored draws languagesAuthored, %s", (theme) => {
    const { github } = sampleProfileData();
    const data = {
      github: {
        ...github,
        languagesAuthored: [
          { name: "Haskell", color: "#5e5086", share: 0.6, additions: 600 },
          { name: "Erlang", color: "#B83998", share: 0.3, additions: 300 },
          { name: "Elixir", color: "#6e4a7e", share: 0.1, additions: 100 },
        ],
      },
    };
    const svg = render(template, section, theme, { languageShare: "authored" }, data);
    expect(position(svg, "Haskell")).toBeGreaterThan(-1);
    expect(position(svg, "Haskell")).toBeLessThan(position(svg, "Erlang"));
    expect(svg).not.toContain("TypeScript");
    expect(render(template, section, theme, {}, data)).not.toContain("Haskell");
  });

  test.each(themes)(
    "authored with an empty or missing languagesAuthored draws bytes, %s",
    (theme) => {
      const plain = render(template, section, theme, {});
      expect(render(template, section, theme, { languageShare: "authored" })).toBe(plain);
      const older = Object.fromEntries(
        Object.entries(sampleProfileData().github).filter(([key]) => key !== "languagesAuthored"),
      );
      const svg = render(template, section, theme, { languageShare: "authored" }, {
        github: older,
      } as never);
      expect(svg).toBe(plain);
    },
  );
});
