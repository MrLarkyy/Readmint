import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import type { ProfileTemplate } from "../src/index.js";
import { loadProfile, profileFontAssets, renderProfile } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

const rocket = "\u{1F680}";
const party = "\u{1F389}";
const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";

function withStatus(message: string) {
  const data = sampleProfileData();
  return { github: { ...data.github, status: { emoji: null, message } } };
}

/** The sample data with `github` fields replaced. */
function withGitHub(fields: Record<string, unknown>) {
  const data = sampleProfileData();
  return { github: { ...data.github, ...fields } };
}

/** The x each translated slot of the status row starts at, in document order. */
function slotStarts(svg: string): number[] {
  return [...svg.matchAll(/translate\(([\d.]+) 0\)/gu)].map((match) => Number(match[1]));
}

/** A section with root props overridden, as a user sets them. */
function withProps(design: Design, props: Record<string, string>): Design {
  const [root, ...rest] = design.layers;
  if (root?.type !== "component") throw new Error("the section has no root component");
  return { ...design, layers: [{ ...root, props: { ...root.props, ...props } }, ...rest] };
}

/** The box width a text layer of the section's font draws `text` with: what the templates must follow. */
function drawnWidth(
  template: ProfileTemplate,
  design: Design,
  font: string,
  fontSize: number,
  text: string,
  letterSpacing = 0,
): number {
  const probe: Design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    ...(design.assets === undefined ? {} : { assets: design.assets }),
    layers: [{ type: "text", content: "{{ t }}", font, fontSize, letterSpacing }],
  };
  const result = renderSvg(probe, {
    data: { t: text },
    assets: { fonts: profileFontAssets(template, design) },
    layerBoxes: true,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.layerBoxes?.[0]?.width ?? Number.NaN;
}

/** The longest start of whole clusters plus "…" that a probe draws within `width`: the cut the ticker must make. */
function longestCut(width: (text: string) => number, text: string, max: number): string {
  if (width(text) <= max) return text;
  const clusters = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map(
    (part) => part.segment,
  );
  let best = "";
  for (let count = 0; count < clusters.length; count++) {
    const cut = `${clusters.slice(0, count).join("")}…`;
    if (width(cut) <= max) best = cut;
  }
  return best;
}

/** Every px translation of the CSS keyframes. */
function translations(svg: string): number[] {
  return [...svg.matchAll(/translate\((-?[\d.]+)px,0px\)/gu)].map((match) => Number(match[1]));
}

function expectTranslation(svg: string, value: number): void {
  const found = translations(svg).some((x) => Math.abs(x - value) < 0.0015);
  expect(found, `a keyframe translates by ${String(value)}`).toBe(true);
}

/** The rect of the SVG at `y` (a pill or underline), its x and width. */
function rectAt(svg: string, y: number): { x: number; width: number } {
  const match = new RegExp(`<rect x="([\\d.]+)" y="${String(y)}" width="([\\d.]+)"`, "u").exec(svg);
  if (match === null) throw new Error(`no rect at y ${String(y)}`);
  return { x: Number(match[1]), width: Number(match[2]) };
}

describe("emoji no template font covers", () => {
  test("the pinscreen status row follows the drawn status, not its code point count", () => {
    const render = (message: string) =>
      renderProfile({
        template: "pinscreen",
        design: loadProfile("pinscreen", "header"),
        data: withStatus(message),
        expectWarnings: message.includes(rocket) ? ["missing-glyph"] : [],
      });
    const plain = slotStarts(render("ab"));
    const dropped = slotStarts(render(`ab${rocket}${rocket}${rocket}${rocket}`));
    expect(plain).toContain(131.8);
    expect(dropped).toEqual(plain);
  });

  test("the pinscreen status row keeps its place without a status", () => {
    const svg = renderProfile({
      template: "pinscreen",
      design: loadProfile("pinscreen", "header"),
      data: withStatus(""),
    });
    expect(slotStarts(svg)).toContain(118);
  });

  test("the horizon name fills the 840 px line as drawn, emoji and all", () => {
    for (const name of [
      `Ada ${rocket} Lovelace`,
      `${family}Grace Hopper${party}`,
      "Sample Developer",
    ]) {
      const design = loadProfile("horizon", "header");
      const svg = renderProfile({
        template: "horizon",
        design,
        data: withGitHub({ name }),
        expectWarnings: name.includes("Sample") ? [] : ["missing-glyph"],
      });
      const size = Number(/font-weight="800" font-size="([\d.]+)"/u.exec(svg)?.[1]);
      const drawn = drawnWidth("horizon", design, "xb", size, name.toUpperCase(), -size * 0.01);
      if (size < 124) expect(Math.abs(drawn - 840)).toBeLessThan(0.5);
      else expect(drawn).toBeLessThanOrEqual(840);
    }
  });

  test("the pinscreen contact underline is as long as the contact as drawn", () => {
    const contact = `hi ${rocket} there`;
    const design = withProps(loadProfile("pinscreen", "footer"), { contactText: contact });
    const svg = renderProfile({
      template: "pinscreen",
      design,
      data: sampleProfileData(),
      expectWarnings: ["missing-glyph"],
    });
    const width = drawnWidth("pinscreen", design, "mono", 14, contact);
    expect(width).toBeCloseTo(8.4 * 9, 9);
    expect(rectAt(svg, 92.25)).toEqual({ x: 840 - width, width });
  });

  test.each([
    ["horizon", "scm", 18, 99],
    ["year-ring", "med", 17, 90.25],
  ] as const)(
    "the %s contact pill is the contact as drawn plus 16 px",
    (template, font, size, y) => {
      const contact = `ada${rocket}.dev/${party}links`;
      const design = withProps(loadProfile(template, "footer"), { contactText: contact });
      const svg = renderProfile({
        template,
        design,
        data: sampleProfileData(),
        expectWarnings: ["missing-glyph"],
      });
      const width =
        Math.round((drawnWidth(template, design, font, size, contact) + 16) * 1000) / 1000;
      const pill = rectAt(svg, y);
      expect(pill.width).toBeCloseTo(width, 3);
      expect(pill.x).toBeCloseTo(840 - width, 3);
    },
  );

  test("the pinscreen ticker cuts the push to its slot as drawn and travels its drawn width", () => {
    const status = `on call ${rocket}`;
    const right = `${party} v2.0 ${party}`;
    const push = `${rocket} ${party} a very long push message with emoji ${rocket} that cannot fit beside the status row ${family} at all`;
    const design = withProps(loadProfile("pinscreen", "header"), { statusBarRight: right });
    const data = withGitHub({
      status: { emoji: null, message: status },
      pushes: [{ ...sampleProfileData().github.pushes[0], repository: "tinydb", message: push }],
    });
    const svg = renderProfile({
      template: "pinscreen",
      design,
      data,
      expectWarnings: ["missing-glyph"],
    });
    const width = (text: string) => drawnWidth("pinscreen", design, "mono", 11.5, text);
    const slot = 826 - (104 + width(status) + 14 + 85) - width(right) - 24;
    const ticker = longestCut(width, `tinydb: ${push}`, Math.max(slot, 27.6));
    expect(ticker.endsWith("…")).toBe(true);
    // A length estimate counts each dropped emoji as a character, so it would have cut earlier.
    expect(Array.from(ticker).length).toBeGreaterThan(Math.floor(slot / 6.9));
    const travel = width(ticker);
    expect(travel).toBeLessThanOrEqual(slot);
    expectTranslation(svg, -travel);
    expectTranslation(svg, travel - 900);
    expectTranslation(svg, 900 - travel);
  });

  test("the year-ring ticker travels the push's drawn width", () => {
    const push = `Ship ${rocket} the release ${party} today ${family}`;
    const design = loadProfile("year-ring", "header");
    const data = withGitHub({
      pushes: [{ ...sampleProfileData().github.pushes[0], message: push }],
    });
    const svg = renderProfile({
      template: "year-ring",
      design,
      data,
      expectWarnings: ["missing-glyph"],
    });
    const travel = drawnWidth("year-ring", design, "reg", 14, push);
    expectTranslation(svg, -travel);
    expectTranslation(svg, travel - 900);
  });

  test.each(["pinscreen", "year-ring"] as const)(
    "the %s bio is drawn as written, its emoji dropped",
    (template) => {
      const svg = renderProfile({
        template,
        design: loadProfile(template, "header"),
        data: withGitHub({ bio: `Builds ${rocket} small tools and writes about them.` }),
        expectWarnings: ["missing-glyph"],
      });
      for (const word of ["Builds", "small", "tools", "writes", "them."])
        expect(svg).toContain(word);
      expect(svg).not.toContain(rocket);
    },
  );
});
