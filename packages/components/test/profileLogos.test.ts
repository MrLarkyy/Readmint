import { applyDesignProps, type ComponentPropValue, type Design } from "@readmint/format";
import { renderSvg, RenderLimits, type LayerBox } from "@readmint/renderer";
import { profileLogos } from "@readmint/examples/logos";
import { profileExampleProps } from "@readmint/examples/props";
import { describe, expect, test } from "vitest";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { loadProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

type Props = Readonly<Record<string, ComponentPropValue>>;

/** A neutral square of the nominal logo height: the committed examples carry no brand path. */
const square = "M0 0h14v14H0Z";
/** The widest path data a logo may have, as plain strokes of the format's character set. */
const widest = `M0 0${"l1 1".repeat(1499)}`;

interface Strip {
  readonly template: ProfileTemplate;
  readonly section: ProfileSection;
  readonly row: number;
  readonly right: number;
  readonly lineShift: number;
  readonly ink: Readonly<Record<ProfileTheme, string>>;
  readonly base: Props;
}

const strips: readonly Strip[] = [
  {
    template: "year-ring",
    section: "index",
    row: 5,
    right: 840,
    lineShift: 22,
    ink: { light: "#15171C", dark: "#ECEEF2" },
    base: {
      labels: ["a", "b", "c", "d", "e", "Shipped for", "f"],
      values: ["a", "b", "c", "d", "e", "Joined names", "f"],
    },
  },
  {
    template: "pinscreen",
    section: "stack",
    row: 1,
    right: 620,
    lineShift: 20,
    ink: { light: "#8C8C8C", dark: "#808080" },
    base: {
      plugin: 'kotlin("jvm")',
      labels: ["a", "b", "c", "d"],
      items: ["a", "b", "c", "d"],
      noteLabels: ["tools", "shipped for", "creators"],
      noteItems: ["x", "Joined names", "y"],
    },
  },
];
const themes: readonly ProfileTheme[] = ["light", "dark"];
const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];
const cases = strips.flatMap((strip) => themes.map((theme) => [strip, theme] as const));

interface Rendered {
  readonly svg: string;
  readonly height: number;
  readonly boxes: readonly LayerBox[];
}

function render(strip: Strip, theme: ProfileTheme, props: Props): Rendered {
  const loaded = loadProfile(strip.template, strip.section, theme);
  const applied = applyDesignProps(loaded, { ...strip.base, ...props });
  if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
  const sample = sampleProfileData();
  const result = renderSvg(applied.value, {
    data: { github: { ...sample.github, languages: sample.github.languages.slice(0, 3) } },
    assets: { fonts: profileFontAssets(strip.template, applied.value) },
    time: 0,
    layerBoxes: true,
  });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  const height = Number(/^<svg [^>]*\bheight="([^"]*)"/.exec(result.svg)?.[1]);
  return { svg: result.svg, height, boxes: result.layerBoxes ?? [] };
}

const withLogos = (strip: Strip, logos: readonly string[], list = names): Props => ({
  logoNames: list,
  logos,
  logosRow: strip.row,
});
/** The drawn paths: the 14 px boxes, once each (an item group has the box of its path). */
const squares = (boxes: readonly LayerBox[]) => {
  const own = boxes.filter((box) => box.width === 14 && box.height === 14);
  return own.filter((box, index) => own.findIndex((o) => o.x === box.x && o.y === box.y) === index);
};
const bottom = (box: LayerBox) => box.y + box.height;

describe.each(cases)("the logo strip of %o (%s)", (strip, theme) => {
  test("draws one path in the row ink per logo and the name as text where there is none", () => {
    const logos = [square, "", square, "", square, square, ""];
    const { svg } = render(strip, theme, withLogos(strip, logos));
    const paths = svg.match(new RegExp(`<path [^>]*fill="${strip.ink[theme]}"[^>]*>`, "giu")) ?? [];
    expect(paths.filter((path) => path.includes(` d="${square}"`))).toHaveLength(4);
    names.forEach((name, index) => {
      expect(svg.includes(`>${name}<`), name).toBe(logos[index] === "");
    });
    expect(svg).not.toContain("Joined names");
  });

  test("takes two lines from 6 items, the second lower by one line", () => {
    const { boxes } = render(
      strip,
      theme,
      withLogos(
        strip,
        names.map(() => square),
      ),
    );
    const items = squares(boxes);
    expect(items).toHaveLength(7);
    const lines = [...new Set(items.map((box) => box.y))];
    expect(lines).toHaveLength(2);
    expect(Math.max(...lines) - Math.min(...lines)).toBe(strip.lineShift);
    expect(items.filter((box) => box.y === Math.min(...lines))).toHaveLength(4);
  });

  test("stays on one line below 6 items and grows the canvas only when it wraps", () => {
    const plain = render(strip, theme, {});
    const five = render(
      strip,
      theme,
      withLogos(
        strip,
        names.slice(0, 5).map(() => square),
        names.slice(0, 5),
      ),
    );
    const seven = render(
      strip,
      theme,
      withLogos(
        strip,
        names.map(() => square),
      ),
    );
    expect(new Set(squares(five.boxes).map((box) => box.y)).size).toBe(1);
    expect(five.height).toBe(plain.height);
    expect(seven.height).toBe(plain.height + strip.lineShift);
  });

  test("keeps every box inside the canvas and left of the panel", () => {
    const { boxes, height } = render(
      strip,
      theme,
      withLogos(
        strip,
        names.map(() => square),
      ),
    );
    for (const box of squares(boxes)) expect(box.x + box.width).toBeLessThanOrEqual(strip.right);
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test("moves what follows the strip down by one line and nothing before it", () => {
    const plain = render(strip, theme, {});
    const wrapped = render(
      strip,
      theme,
      withLogos(
        strip,
        names.map(() => square),
      ),
    );
    const pick = (boxes: readonly LayerBox[]) =>
      boxes
        .filter((box) =>
          strip.template === "pinscreen" ? box.x === 44 : box.height === 1 && box.width === 840,
        )
        .map((box) => box.y)
        .sort((a, b) => a - b);
    const before = pick(plain.boxes);
    const after = pick(wrapped.boxes);
    const stripTop = strip.template === "pinscreen" ? 96 + 20 * 14 - 11 : 35 + 36 * 6 + 34;
    expect(after).toHaveLength(before.length);
    const moved = before.map((y) => (y > stripTop ? y + strip.lineShift : y));
    expect(after).toEqual(moved);
    expect(before.filter((y) => y > stripTop).length).toBeGreaterThan(0);
  });

  test("draws at most 12 items", () => {
    const many = Array.from({ length: 13 }, (_, index) => `Name ${String(index)}`);
    const { boxes } = render(
      strip,
      theme,
      withLogos(
        strip,
        many.map(() => square),
        many,
      ),
    );
    expect(squares(boxes)).toHaveLength(12);
  });

  test("shows the old text without names or without a row", () => {
    const plain = render(strip, theme, {}).svg;
    expect(plain).toContain("Joined names");
    expect(render(strip, theme, { logoNames: [], logos: [], logosRow: strip.row }).svg).toBe(plain);
    expect(render(strip, theme, { logoNames: names, logos: names.map(() => square) }).svg).toBe(
      plain,
    );
  });

  test("refuses path data outside the format's character set and draws nothing", () => {
    const loaded = loadProfile(strip.template, strip.section, theme);
    const applied = applyDesignProps(loaded, {
      ...strip.base,
      ...withLogos(strip, ["M0 0 <script>", ...names.slice(1).map(() => square)]),
    });
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const result = renderSvg(applied.value, {
      data: sampleProfileData(),
      assets: { fonts: profileFontAssets(strip.template, applied.value) },
      time: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("range");
  });

  test("stays within the budget and half the limits with 12 widest paths", () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `Name ${String(index)}`);
    const loaded: Design = loadProfile(strip.template, strip.section, theme);
    const applied = applyDesignProps(loaded, {
      ...strip.base,
      ...withLogos(
        strip,
        twelve.map(() => widest),
        twelve,
      ),
    });
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const result = renderSvg(applied.value, {
      data: sampleProfileData(),
      assets: { fonts: profileFontAssets(strip.template, applied.value) },
      time: 0,
      limits: {
        maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
        maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
      },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(new TextEncoder().encode(result.svg).length).toBeLessThanOrEqual(524_288);
  });
});

describe("profileLogos", () => {
  test("names the projects of the example in the order of its props", () => {
    expect(profileExampleProps["year-ring"]?.index?.logoNames).toEqual(
      profileLogos.map((logo) => logo.name),
    );
    expect(profileExampleProps.pinscreen?.stack?.logoNames).toEqual(
      profileLogos.map((logo) => logo.name),
    );
  });

  test.each(profileLogos.map((logo) => [logo.name, logo] as const))(
    "%s records its source",
    (_, logo) => {
      const drawn = logo.d !== "";
      expect(logo.licence.length).toBeGreaterThan(0);
      expect(logo.trademark.length).toBeGreaterThan(0);
      expect(logo.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(logo.source).toMatch(drawn ? /^https:\/\/[^\s]+$/u : /^(https:\/\/[^\s]+|n\/a: .+)$/u);
      expect(logo.sha256).toMatch(drawn ? /^[0-9a-f]{64}$/u : /^([0-9a-f]{64}|n\/a: .+)$/u);
      if (!drawn) return;
      expect(logo.d.length).toBeLessThanOrEqual(6000);
      expect(logo.d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/u);
      const alone = renderSvg(
        {
          version: 0,
          canvas: { width: 200, height: 40 },
          layers: [{ type: "path", d: logo.d, fill: "#000000" }],
        },
        { time: 0, layerBoxes: true },
      );
      if (!alone.ok) throw new Error(JSON.stringify(alone.issues));
      const [box] = alone.layerBoxes ?? [];
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect(box?.height).toBeGreaterThanOrEqual(10);
      expect(box?.height).toBeLessThanOrEqual(16);
    },
  );
});
