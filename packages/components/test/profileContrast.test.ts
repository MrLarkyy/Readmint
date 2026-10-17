import { expect, test } from "vitest";
import { profileTemplates, type ProfileSection, type ProfileTemplate } from "../src/index.js";
import {
  loadExampleProfile,
  loadProfile,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import { stripFontData } from "./stripFontData.js";
import { sampleProfileData } from "./sampleProfileData.js";

/** The page behind the image on github.com, per theme. */
const pageBackground: Readonly<Record<ProfileTheme, string>> = {
  light: "#ffffff",
  dark: "#0d1117",
};

/**
 * Surfaces a template draws behind its text besides the page: Pinscreen's code and terminal panels.
 * The fills are asserted against a render below, so they cannot drift from the templates.
 */
const panelBackground: Readonly<
  Partial<Record<ProfileTemplate, Readonly<Record<ProfileTheme, string>>>>
> = {
  pinscreen: { light: "#fafafa", dark: "#12161d" },
};

/** WCAG AA for small text; decorative text (line numbers, separators) is held to it too (docs/components.md). */
const minimumContrast = 4.5;

function channels(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) throw new Error(`text fill ${color} is not a hex colour`);
  const full = hex.length === 3 ? hex.replace(/./g, (digit) => digit + digit) : hex;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

interface TextFill {
  readonly fill: string;
  readonly fontSize: string;
  readonly text: string;
}

/** Every `<text>` of a rendered SVG with its fill, font size and string. */
function textFills(svg: string): TextFill[] {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs)].map(
    ([, attributes = "", inner = ""]) => {
      const fill = /\sfill="([^"]+)"/.exec(attributes)?.[1];
      if (fill === undefined) throw new Error(`a text without a fill: ${attributes}`);
      return {
        fill,
        fontSize: /\sfont-size="([^"]+)"/.exec(attributes)?.[1] ?? "?",
        text: inner.replace(/<[^>]*>/g, ""),
      };
    },
  );
}

/** Props: the shipped defaults, or the example's personal texts set (some sections draw text only then). */
type PropSet = "defaults" | "example";
const propSets: readonly PropSet[] = ["defaults", "example"];

const themes: readonly ProfileTheme[] = ["light", "dark"];
const cases = (Object.keys(profileTemplates) as ProfileTemplate[]).flatMap((template) =>
  profileTemplates[template].flatMap((section) =>
    themes.flatMap((theme) => propSets.map((props) => [template, section, theme, props] as const)),
  ),
);

function render(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme,
  props: PropSet = "defaults",
): string {
  return stripFontData(
    renderProfile({
      template,
      design:
        props === "example"
          ? loadExampleProfile(template, section, theme)
          : loadProfile(template, section, theme),
      data: sampleProfileData(),
    }),
  );
}

test.each(cases)(
  "every text of %s %s %s (%s props) reaches 4.5:1 against the page and the template panel",
  (template, section, theme, props) => {
    const texts = textFills(render(template, section, theme, props));
    // horizon/worked ships without items and draws text only once they are set
    if (props === "example") expect(texts.length).toBeGreaterThan(0);
    const surfaces = [pageBackground[theme], panelBackground[template]?.[theme]].filter(
      (surface): surface is string => surface !== undefined,
    );
    const below = texts.flatMap((entry) =>
      surfaces
        .map((surface) => ({ ...entry, surface, ratio: contrast(entry.fill, surface) }))
        .filter((measured) => measured.ratio < minimumContrast)
        .map(
          (measured) =>
            `${measured.fill} on ${measured.surface} ${measured.ratio.toFixed(2)}:1 at ${measured.fontSize}px "${measured.text}"`,
        ),
    );
    expect(below).toEqual([]);
  },
);

test.each(themes)(
  "the pinscreen panel fill of the %s theme occurs in a rendered section",
  (theme) => {
    const fill = panelBackground.pinscreen?.[theme] ?? "";
    expect(render("pinscreen", "repo-1", theme)).toContain(`fill="${fill}"`);
  },
);

test("the contrast function reproduces the measured values of the audit", () => {
  expect(contrast("#a8a8a8", "#ffffff")).toBeCloseTo(2.38, 2);
  expect(contrast("#5e5a55", "#0d1117")).toBeCloseTo(2.77, 2);
  expect(contrast("#ff8a3d", "#0d1117")).toBeCloseTo(8.07, 2);
});
