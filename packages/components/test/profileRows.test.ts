import { expect, test } from "vitest";
import type { Design } from "@readmint/format";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import {
  loadExampleProfile,
  profileFontFiles,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

interface RowCase {
  readonly template: ProfileTemplate;
  readonly section: ProfileSection;
  /** The y of the line that opens the first band (the strip rule, the top rule, the frame line). */
  readonly start: number;
  /** The narrowest rect of height 1 that counts as a rule of a band. */
  readonly ruleWidth: number;
  /** How many bands the section has with the sample data. */
  readonly bands: number;
}

const cases: readonly RowCase[] = [
  { template: "year-ring", section: "index", start: 34, ruleWidth: 840, bands: 8 },
  { template: "year-ring", section: "recent", start: 34, ruleWidth: 840, bands: 6 },
  { template: "horizon", section: "ticker", start: 0, ruleWidth: 840, bands: 1 },
  ...(["repo-1", "repo-2", "repo-3", "repo-4", "repo-5", "repo-6"] as const).map(
    (section) => ({ template: "pinscreen", section, start: 0, ruleWidth: 412, bands: 1 }) as const,
  ),
  { template: "pinscreen", section: "stack", start: 40, ruleWidth: 840, bands: 1 },
];
const themes: readonly ProfileTheme[] = ["light", "dark"];

interface Rule {
  readonly y: number;
}
interface Baseline {
  readonly y: number;
  readonly capHeight: number;
  readonly text: string;
}

/** `sCapHeight` as a fraction of the em, read from the OS/2 table of a TrueType file. */
function capHeightOf(font: Uint8Array): number {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = new Map<string, number>();
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    tables.set(String.fromCharCode(...font.subarray(at, at + 4)), view.getUint32(at + 8));
  }
  const os2 = tables.get("OS/2");
  const head = tables.get("head");
  if (os2 === undefined || head === undefined) throw new Error("font without OS/2 or head");
  return view.getInt16(os2 + 88) / view.getUint16(head + 18);
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(String.raw`\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** The rules and the text baselines of an SVG in absolute coordinates; only translations are expected. */
function measure(svg: string, design: Design, template: ProfileTemplate, ruleWidth: number) {
  const files = profileFontFiles(template);
  const capHeights = new Map<string, number>();
  for (const font of Object.values(design.assets?.fonts ?? {})) {
    const bytes = files[font.src];
    if (bytes === undefined) throw new Error(`no font file ${font.src}`);
    capHeights.set(`${font.family}|${String(font.weight ?? 400)}`, capHeightOf(bytes));
  }
  const rules: Rule[] = [];
  const baselines: Baseline[] = [];
  const offsets: number[] = [0];
  let capHeight = 0;
  let size = 0;
  const body = svg.slice(svg.indexOf("</defs>"));
  for (const match of body.matchAll(/<(g|\/g|rect|text|tspan)\b[^>]*>([^<]*)/g)) {
    const [tag, name = "", content = ""] = match;
    const dy = offsets.reduce((sum, value) => sum + value, 0);
    if (name === "/g") offsets.pop();
    else if (name === "g") {
      const transform = attr(tag, "transform");
      const moved =
        transform === undefined ? undefined : /^translate\(([-\d.]+) ([-\d.]+)\)$/.exec(transform);
      if (transform !== undefined && moved === null) throw new Error(`unexpected ${transform}`);
      if (!tag.endsWith("/>")) offsets.push(Number(moved?.[2] ?? 0));
    } else if (name === "rect") {
      if (attr(tag, "height") === "1" && Number(attr(tag, "width")) >= ruleWidth)
        rules.push({ y: dy + Number(attr(tag, "y")) });
    } else if (name === "text") {
      const family = (attr(tag, "font-family") ?? "").replaceAll("&#39;", "");
      const cap = capHeights.get(`${family}|${attr(tag, "font-weight") ?? ""}`);
      if (cap === undefined) throw new Error(`no cap height for ${family}`);
      size = Number(attr(tag, "font-size"));
      capHeight = cap * size;
    } else {
      baselines.push({ y: dy + Number(attr(tag, "y")), capHeight, text: content });
    }
  }
  return { rules, baselines, size };
}

test.each(cases.flatMap((row) => themes.map((theme) => [row, theme] as const)))(
  "the rows of %j in %s have equal heights and centred text",
  ({ template, section, start, ruleWidth, bands }, theme) => {
    const design = loadExampleProfile(template, section, theme);
    const svg = renderProfile({ template, design, data: sampleProfileData(), time: 0 });
    const { rules, baselines } = measure(svg, design, template, ruleWidth);
    const lines = [
      start,
      ...rules
        .map((rule) => rule.y)
        .filter((y) => y > start)
        .sort((a, b) => a - b),
    ];
    expect(lines.length - 1).toBe(bands);
    const heights = lines.slice(1).map((y, i) => y - (lines[i] ?? 0));
    expect(new Set(heights).size).toBe(1);
    for (let band = 0; band < bands; band++) {
      const top = (lines[band] ?? 0) + 1;
      const bottom = lines[band + 1] ?? 0;
      const centre = (top + bottom) / 2;
      const inside = baselines.filter((line) => line.y > top && line.y < bottom + 1);
      expect(inside.length).toBeGreaterThan(0);
      for (const line of inside)
        expect(Math.abs(line.y - line.capHeight / 2 - centre), line.text).toBeLessThanOrEqual(1);
    }
  },
);
