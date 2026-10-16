import { applyDesignProps, type ComponentPropValue, type Design } from "@readmint/format";
import { renderSvg, RenderLimits, type LayerBox } from "@readmint/renderer";
import { profileLogos } from "@readmint/examples/logos";
import { profileExampleProps } from "@readmint/examples/props";
import { describe, expect, test } from "vitest";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import {
  loadExampleProfile,
  loadProfile,
  profileFontAssets,
  type ProfileTheme,
} from "./profileDesigns.js";
import { sampleProfileData, worstCaseProfileData } from "./sampleProfileData.js";

type Props = Readonly<Record<string, ComponentPropValue>>;

/** A neutral square of the nominal logo height: the committed templates carry no brand path. */
const square = "M0 0h14v14H0Z";
/** The widest path data a logo may have, as plain strokes of the format's character set. */
const widest = `M0 0${"l1 1".repeat(1499)}`;

interface Strip {
  readonly template: ProfileTemplate;
  readonly section: ProfileSection;
  readonly row: number;
  /** The right edge of the room a line of tiles may use. */
  readonly right: number;
  /** Where the first tile starts with and without a caption column. */
  readonly start: { readonly captions: number; readonly none: number };
  /** The top of card line `g` and the height its tiles are centred in. */
  readonly band: (g: number) => number;
  readonly bandHeight: number;
  /** How far the card moves what follows it, for 4 lines. */
  readonly shift: number;
  readonly ink: Readonly<Record<ProfileTheme, string>>;
  readonly base: Props;
}

const strips: readonly Strip[] = [
  {
    template: "year-ring",
    section: "index",
    row: 5,
    right: 832,
    start: { captions: 294, none: 174 },
    band: (g) => 35 + 36 * 6 + 9 + 24 * g,
    bandHeight: 18,
    shift: 72,
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
    right: 604,
    start: { captions: 168.2, none: 78.5 },
    band: (g) => 96 + 20 * (12 + 1 + 1 + g) - 10.982,
    bandHeight: 14,
    shift: 80,
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
const lineOfName = ["0", "1", "1", "2", "2", "3", "3"];
const captions = ["Now", "Before", "", "Creators"];
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

const withLogos = (
  strip: Strip,
  logos: readonly string[],
  list = names,
  lines: readonly string[] = lineOfName,
  labels: readonly string[] = captions,
): Props => ({
  logoNames: list,
  logos,
  logoLines: lines,
  logoLabels: labels,
  logosRow: strip.row,
});
const allSquares = names.map(() => square);
/** The drawn paths: the 14 px boxes, once each (an item group has the box of its path). */
const squares = (boxes: readonly LayerBox[]) => {
  const own = boxes.filter((box) => box.width === 14 && box.height === 14);
  return own.filter((box, index) => own.findIndex((o) => o.x === box.x && o.y === box.y) === index);
};
const bottom = (box: LayerBox) => box.y + box.height;
const centre = (box: LayerBox) => box.y + box.height / 2;
const lineCentre = (strip: Strip, g: number) => strip.band(g) + strip.bandHeight / 2;
const onLine = (strip: Strip, boxes: readonly LayerBox[], g: number) =>
  squares(boxes).filter((box) => Math.abs(centre(box) - lineCentre(strip, g)) < 1);

describe.each(cases)("the card of %o (%s)", (strip, theme) => {
  test("draws one path in the row ink per logo and every name as text", () => {
    const logos = [square, "", square, "", square, square, ""];
    const { svg } = render(strip, theme, withLogos(strip, logos));
    const paths = svg.match(new RegExp(`<path [^>]*fill="${strip.ink[theme]}"[^>]*>`, "giu")) ?? [];
    expect(paths.filter((path) => path.includes(` d="${square}"`))).toHaveLength(4);
    for (const name of names) expect(svg.includes(`>${name}<`), name).toBe(true);
    expect(svg).not.toContain("Joined names");
  });

  test("draws item k on the line logoLines[k]", () => {
    const { boxes } = render(strip, theme, withLogos(strip, allSquares));
    expect([0, 1, 2, 3].map((g) => onLine(strip, boxes, g).length)).toEqual([1, 2, 2, 2]);
    expect(squares(boxes)).toHaveLength(7);
  });

  test("puts an item without an entry in logoLines on the first line", () => {
    const { boxes } = render(strip, theme, withLogos(strip, allSquares, names, ["2"]));
    expect([0, 1, 2, 3].map((g) => onLine(strip, boxes, g).length)).toEqual([6, 0, 1, 0]);
  });

  test("draws no item of a line the captions do not give", () => {
    const { boxes } = render(
      strip,
      theme,
      withLogos(strip, allSquares, names, lineOfName, ["Now", "Before"]),
    );
    expect(squares(boxes)).toHaveLength(3);
  });

  test("starts the tiles after the caption column, or at the left where no line has a caption", () => {
    const left = (boxes: readonly LayerBox[]) => Math.min(...squares(boxes).map((box) => box.x));
    for (const labels of [[""], []]) {
      const { boxes } = render(strip, theme, withLogos(strip, allSquares, names, ["0"], labels));
      expect(left(boxes)).toBeCloseTo(strip.start.none, 6);
    }
    expect(left(render(strip, theme, withLogos(strip, allSquares)).boxes)).toBeCloseTo(
      strip.start.captions,
      6,
    );
  });

  test("draws the name alone where the path is empty", () => {
    const { svg } = render(
      strip,
      theme,
      withLogos(
        strip,
        names.map(() => ""),
      ),
    );
    for (const name of names) expect(svg.includes(`>${name}<`), name).toBe(true);
    expect(svg).not.toContain(`d="${square}"`);
  });

  test("centres the logos of a line of logos and of a line with a name only on the line", () => {
    const logos = [square, square, "", square, square, "", ""];
    const { boxes } = render(strip, theme, withLogos(strip, logos));
    expect(squares(boxes)).toHaveLength(4);
    expect(onLine(strip, boxes, 0)).toHaveLength(1);
    expect(onLine(strip, boxes, 1)).toHaveLength(1);
    expect(onLine(strip, boxes, 2)).toHaveLength(2);
  });

  test("keeps every box inside the canvas and left of the panel", () => {
    const { boxes, height } = render(strip, theme, withLogos(strip, allSquares));
    for (const box of squares(boxes)) expect(box.x + box.width).toBeLessThanOrEqual(strip.right);
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
  });

  test("grows the canvas by the lines of the card and moves what follows it", () => {
    const plain = render(strip, theme, {});
    const card = render(strip, theme, withLogos(strip, allSquares));
    expect(card.height).toBe(plain.height + strip.shift);
    const rules = (boxes: readonly LayerBox[]) =>
      boxes
        .filter((box) =>
          strip.template === "pinscreen" ? box.x === 44 : box.height === 1 && box.width === 840,
        )
        .map((box) => box.y);
    const top = strip.band(0) - 5;
    const after = (boxes: readonly LayerBox[]) => rules(boxes).filter((y) => y > top);
    const above = (boxes: readonly LayerBox[]) => rules(boxes).filter((y) => y <= top);
    expect(above(card.boxes)).toEqual(above(plain.boxes));
    expect(after(plain.boxes).length).toBeGreaterThan(0);
    for (const y of after(plain.boxes)) expect(after(card.boxes)).toContain(y + strip.shift);
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
        many.map(() => "0"),
      ),
    );
    expect(squares(boxes)).toHaveLength(12);
  });

  test("shows the old text without names or without a row", () => {
    const plain = render(strip, theme, {}).svg;
    expect(plain).toContain("Joined names");
    expect(render(strip, theme, { logoNames: [], logos: [], logosRow: strip.row }).svg).toBe(plain);
    expect(render(strip, theme, { logoNames: names, logos: allSquares }).svg).toBe(plain);
  });

  test("draws one line without captions and lines", () => {
    const { boxes } = render(strip, theme, {
      logoNames: names,
      logos: allSquares,
      logosRow: strip.row,
    });
    expect(onLine(strip, boxes, 0)).toHaveLength(7);
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

  test("stays within the budget and half the limits with 12 widest paths, 4 lines, every prop at its cap, worst-case data", () => {
    const long = (label: string) => `${label} ${"W".repeat(200)}`;
    const capped = (count: number, label: string) =>
      Array.from({ length: count }, (_, index) => long(`${label}${String(index)}`));
    const twelve = capped(12, "Name");
    const filled: Props =
      strip.template === "year-ring"
        ? { labels: capped(8, "label"), values: capped(8, "value") }
        : {
            plugin: long("plugin"),
            labels: capped(4, "group"),
            items: capped(4, "item"),
            noteLabels: capped(3, "note"),
            noteItems: capped(3, "text"),
          };
    const loaded: Design = loadProfile(strip.template, strip.section, theme);
    const applied = applyDesignProps(loaded, {
      ...filled,
      ...withLogos(
        strip,
        twelve.map(() => widest),
        twelve,
        twelve.map((_, index) => String(index % 4)),
        capped(4, "Caption"),
      ),
    });
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const result = renderSvg(applied.value, {
      data: worstCaseProfileData(),
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

describe.each(cases)("the example card of %o (%s)", (strip, theme) => {
  const example = () => {
    const design = loadExampleProfile(strip.template, strip.section, theme);
    const sample = sampleProfileData();
    const result = renderSvg(design, {
      data: { github: { ...sample.github, languages: sample.github.languages.slice(0, 3) } },
      assets: { fonts: profileFontAssets(strip.template, design) },
      time: 0,
      layerBoxes: true,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return { svg: result.svg, boxes: result.layerBoxes ?? [] };
  };

  test("draws the paths found and every name, no tile past its line, every box in the canvas", () => {
    const { svg, boxes } = example();
    const height = Number(/^<svg [^>]*\bheight="([^"]*)"/.exec(svg)?.[1]);
    for (const logo of profileLogos.filter((entry) => entry.d !== "")) {
      expect(svg).toContain(` d="${logo.d}"`);
    }
    for (const logo of profileLogos) expect(svg.includes(`>${logo.name}<`), logo.name).toBe(true);
    for (const box of boxes) expect(bottom(box)).toBeLessThanOrEqual(height);
    for (let g = 0; g < 4; g++) {
      const line = boxes.filter(
        (box) =>
          box.x >= strip.start.none &&
          box.height <= strip.bandHeight &&
          Math.abs(centre(box) - lineCentre(strip, g)) < 3,
      );
      expect(line.length, `line ${String(g)}`).toBeGreaterThan(0);
      for (const box of line) {
        expect(box.x + box.width, `line ${String(g)}`).toBeLessThanOrEqual(strip.right);
      }
    }
  });

  test("centres every logo of the example on its line", () => {
    const { boxes } = example();
    const first = lineCentre(strip, 0) - 8;
    const last = lineCentre(strip, 3) + 8;
    const found = boxes.filter(
      (box) =>
        box.x >= strip.start.none &&
        box.height >= 13.5 &&
        box.height <= 14.5 &&
        centre(box) > first &&
        centre(box) < last,
    );
    expect(found.length).toBeGreaterThanOrEqual(
      profileLogos.filter((logo) => logo.d !== "").length,
    );
    for (const box of found) {
      const nearest = [0, 1, 2, 3].map((g) => Math.abs(centre(box) - lineCentre(strip, g)));
      expect(Math.min(...nearest)).toBeLessThan(1);
    }
  });

  test("has no script, event attribute or external reference", () => {
    const { svg } = example();
    expect(svg).not.toMatch(/<script|\son[a-z]+=|href="https?:|url\(https?:|<foreignObject/iu);
  });
});

describe("profileLogos", () => {
  test("names the projects of the example in the order of its props", () => {
    for (const props of [
      profileExampleProps["year-ring"]?.index,
      profileExampleProps.pinscreen?.stack,
    ]) {
      expect(props?.logoNames).toEqual(profileLogos.map((logo) => logo.name));
      expect(props?.logoLines).toEqual(profileLogos.map((logo) => String(logo.line)));
    }
  });

  test("puts the projects of a line next to each other, lines in order", () => {
    const lines = profileLogos.map((logo) => logo.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(Math.max(...lines)).toBeLessThan(4);
  });

  test.each(profileLogos.map((logo) => [logo.name, logo] as const))(
    "%s records its source",
    (_, logo) => {
      const drawn = logo.d !== "";
      expect(logo.licence.length).toBeGreaterThan(0);
      expect(logo.owner.length).toBeGreaterThan(0);
      expect(logo.note).toContain("author's responsibility");
      expect(logo.page).toMatch(/^https:\/\/[^\s]+$/u);
      expect(logo.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(logo.source).toMatch(drawn ? /^https:\/\/[^\s]+$/u : /^n\/a: .+$/u);
      expect(logo.sha256).toMatch(drawn ? /^[0-9a-f]{64}$/u : /^n\/a: .+$/u);
      if (!drawn) return;
      expect(logo.d.length).toBeLessThanOrEqual(6000);
      expect(logo.d).toMatch(/^M[MLCZ0-9.\-\s]*Z$/u);
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
      expect(box?.x).toBeGreaterThanOrEqual(-0.05);
      expect(box?.y).toBeGreaterThanOrEqual(-0.05);
      expect(box?.height).toBeGreaterThanOrEqual(13.5);
      expect(box?.height).toBeLessThanOrEqual(14.5);
    },
  );
});
