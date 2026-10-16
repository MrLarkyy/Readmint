import { expect, test } from "vitest";
import type { Design } from "@readmint/format";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import {
  loadExampleProfile,
  loadProfile,
  profileFontFiles,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import { sampleProfileData, type ProfileData } from "./sampleProfileData.js";

interface RowCase {
  readonly template: ProfileTemplate;
  readonly section: ProfileSection;
  readonly state: string;
  /** The y of the line that opens the first band when no rule does (the frame line of a card); else the first rule opens it. */
  readonly start?: number;
  /** The narrowest rect of height 1 that counts as a rule of a band. */
  readonly ruleWidth: number;
  /** How many bands the section has. */
  readonly bands: number;
  /** The y of a closing line the design does not draw (the last band of an empty list). */
  readonly closing?: number;
  /** The height of the bars that must sit on the centre of their band. */
  readonly barHeight?: number;
  /** The section as published, without the example's personal texts. */
  readonly plain?: boolean;
  /** Example props left unset: the wrapped logo strip makes its row taller than the others on purpose. */
  readonly omit?: readonly string[];
  readonly data?: (data: ProfileData) => ProfileData;
}

const noPushes = (data: ProfileData): ProfileData => ({
  github: { ...data.github, pushes: [] },
});
const noRepositories = (data: ProfileData): ProfileData => ({
  github: { ...data.github, repositories: [], pinned: [] },
});

const cases: readonly RowCase[] = [
  {
    template: "year-ring",
    section: "index",
    state: "filled",
    ruleWidth: 840,
    bands: 8,
    barHeight: 5,
    omit: ["logosRow"],
  },
  {
    template: "year-ring",
    section: "index",
    state: "without labels",
    plain: true,
    ruleWidth: 840,
    bands: 1,
    barHeight: 5,
  },
  {
    template: "year-ring",
    section: "recent",
    state: "filled",
    ruleWidth: 840,
    bands: 6,
    barHeight: 4,
  },
  {
    template: "year-ring",
    section: "recent",
    state: "without pushes",
    ruleWidth: 840,
    bands: 1,
    closing: 74,
    data: noPushes,
  },
  { template: "horizon", section: "ticker", state: "filled", ruleWidth: 840, bands: 1 },
  {
    template: "horizon",
    section: "ticker",
    state: "without pushes",
    ruleWidth: 840,
    bands: 1,
    data: noPushes,
  },
  ...(["repo-1", "repo-2", "repo-3", "repo-4", "repo-5", "repo-6"] as const).map(
    (section) =>
      ({
        template: "pinscreen",
        section,
        state: "filled",
        start: 0,
        ruleWidth: 412,
        bands: 1,
      }) as const,
  ),
  {
    template: "pinscreen",
    section: "repo-1",
    state: "without repository",
    start: 0,
    ruleWidth: 412,
    bands: 1,
    data: noRepositories,
  },
  { template: "pinscreen", section: "stack", state: "filled", start: 40, ruleWidth: 840, bands: 1 },
];
const themes: readonly ProfileTheme[] = ["light", "dark"];

interface Rule {
  readonly y: number;
}
interface Bar {
  readonly y: number;
  readonly height: number;
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
function measure(
  svg: string,
  design: Design,
  template: ProfileTemplate,
  ruleWidth: number,
  barHeight: number | undefined,
) {
  const files = profileFontFiles(template);
  const capHeights = new Map<string, number>();
  for (const font of Object.values(design.assets?.fonts ?? {})) {
    const bytes = files[font.src];
    if (bytes === undefined) throw new Error(`no font file ${font.src}`);
    capHeights.set(`${font.family}|${String(font.weight ?? 400)}`, capHeightOf(bytes));
  }
  const rules: Rule[] = [];
  const bars: Bar[] = [];
  const baselines: Baseline[] = [];
  const offsets: number[] = [0];
  let capHeight = 0;
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
      else if (barHeight !== undefined && attr(tag, "height") === String(barHeight))
        bars.push({ y: dy + Number(attr(tag, "y")), height: barHeight });
    } else if (name === "text") {
      const family = (attr(tag, "font-family") ?? "").replaceAll("&#39;", "");
      const cap = capHeights.get(`${family}|${attr(tag, "font-weight") ?? ""}`);
      if (cap === undefined) throw new Error(`no cap height for ${family}`);
      capHeight = cap * Number(attr(tag, "font-size"));
    } else {
      baselines.push({ y: dy + Number(attr(tag, "y")), capHeight, text: content });
    }
  }
  return { rules, bars, baselines };
}

test.each(cases.flatMap((row) => themes.map((theme) => [row, theme] as const)))(
  "the rows of %j in %s have equal heights, one baseline and centred text and bars",
  (
    { template, section, start, ruleWidth, bands, closing, barHeight, plain, omit, data },
    theme,
  ) => {
    const design =
      plain === true
        ? loadProfile(template, section, theme)
        : loadExampleProfile(template, section, theme, omit);
    const svg = renderProfile({
      template,
      design,
      data: (data ?? ((value: ProfileData) => value))(sampleProfileData()),
      time: 0,
    });
    const { rules, bars, baselines } = measure(svg, design, template, ruleWidth, barHeight);
    const ys = rules.map((rule) => rule.y).sort((a, b) => a - b);
    if (start === undefined) expect(ys.length, "an opening rule").toBeGreaterThan(0);
    const lines = start === undefined ? ys : [start, ...ys.filter((y) => y > start)];
    if (closing !== undefined) lines.push(closing);
    expect(lines.length - 1).toBe(bands);
    const heights = lines.slice(1).map((y, i) => y - (lines[i] ?? 0));
    expect(new Set(heights).size).toBe(1);
    if (barHeight !== undefined) expect(bars.length, "bars").toBeGreaterThan(0);
    for (let band = 0; band < bands; band++) {
      const top = (lines[band] ?? 0) + 1;
      const bottom = lines[band + 1] ?? 0;
      const centre = (top + bottom) / 2;
      const inside = baselines.filter((line) => line.y > top && line.y < bottom + 1);
      expect(inside.length).toBeGreaterThan(0);
      const first = inside[0]?.y ?? 0;
      for (const line of inside) {
        expect(Math.abs(line.y - line.capHeight / 2 - centre), line.text).toBeLessThanOrEqual(1);
        expect(Math.abs(line.y - first), `${line.text} shares the baseline`).toBeLessThanOrEqual(
          0.01,
        );
      }
      for (const bar of bars.filter((own) => own.y > top - 1 && own.y < bottom))
        expect(Math.abs(bar.y + bar.height / 2 - centre)).toBeLessThanOrEqual(1);
    }
  },
);
