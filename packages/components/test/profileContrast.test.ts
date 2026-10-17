import { expect, test } from "vitest";
import { profileTemplates, type ProfileTemplate } from "../src/index.js";
import { loadProfile, renderProfile, type ProfileTheme } from "./profileDesigns.js";
import { stripFontData } from "./stripFontData.js";
import { sampleProfileData } from "./sampleProfileData.js";

/** The page behind the image on github.com, per theme. */
const pageBackground: Readonly<Record<ProfileTheme, string>> = {
  light: "#ffffff",
  dark: "#0d1117",
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

const themes: readonly ProfileTheme[] = ["light", "dark"];
const cases = (Object.keys(profileTemplates) as ProfileTemplate[]).flatMap((template) =>
  profileTemplates[template].flatMap((section) =>
    themes.map((theme) => [template, section, theme] as const),
  ),
);

test.each(cases)(
  "every text of %s %s %s reaches 4.5:1 against the page",
  (template, section, theme) => {
    const svg = stripFontData(
      renderProfile({
        template,
        design: loadProfile(template, section, theme),
        data: sampleProfileData(),
      }),
    );
    const texts = textFills(svg);
    const below = texts
      .map((entry) => ({ ...entry, ratio: contrast(entry.fill, pageBackground[theme]) }))
      .filter((entry) => entry.ratio < minimumContrast)
      .map(
        (entry) =>
          `${entry.fill} ${entry.ratio.toFixed(2)}:1 at ${entry.fontSize}px "${entry.text}"`,
      );
    expect(below).toEqual([]);
  },
);

test("the contrast function reproduces the measured values of the audit", () => {
  expect(contrast("#a8a8a8", "#ffffff")).toBeCloseTo(2.38, 2);
  expect(contrast("#5e5a55", "#0d1117")).toBeCloseTo(2.77, 2);
  expect(contrast("#ff8a3d", "#0d1117")).toBeCloseTo(8.07, 2);
});
