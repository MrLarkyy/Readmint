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
  profileSource,
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
  /** The card panel the logos sit on, per theme. */
  readonly panel: Readonly<Record<ProfileTheme, string>>;
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
    panel: { light: "#F4F5F7", dark: "#1A1E24" },
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
    panel: { light: "#FAFAFA", dark: "#12161D" },
    base: {
      plugin: 'kotlin("jvm")',
      labels: ["a", "b", "c", "d"],
      items: ["a", "b", "c", "d"],
      noteLabels: ["tools", "shipped for", "creators"],
      noteItems: ["x", "Joined names", "y"],
    },
  },
];
const relative = (hex: string) => {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [relative(a), relative(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
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
/** A layer path of a known size: `w` wide and 14 tall, so each layer can be told apart in the SVG. */
const layerPath = (w: number) => `M0 0h${String(w)}v14H0Z`;

interface Tile {
  readonly layers: readonly (readonly [d: string, fill: string, fillDark?: string])[];
  readonly withName?: boolean;
}

/** Props of the colour logos: tile k fills the slots 4k..4k+3 of the flat, stride-4 arrays. */
const withTiles = (strip: Strip, tiles: readonly Tile[], lines?: readonly string[]): Props => ({
  logoNames: tiles.map((_, index) => `Tile${String(index)}`),
  logoLines: lines ?? tiles.map(() => "0"),
  logoLabels: ["Now"],
  logosRow: strip.row,
  logoLayers: tiles.flatMap((tile) =>
    Array.from({ length: 4 }, (_, j) => tile.layers[j]?.[0] ?? ""),
  ),
  logoFills: tiles.flatMap((tile) =>
    Array.from({ length: 4 }, (_, j) => tile.layers[j]?.[1] ?? ""),
  ),
  logoFillsDark: tiles.flatMap((tile) =>
    Array.from({ length: 4 }, (_, j) => tile.layers[j]?.[2] ?? ""),
  ),
  logoWithName: tiles.map((tile) => (tile.withName === true ? "1" : "")),
});

/** The layer paths drawn (those of `layerPath`) as `[width, fill]`, in document order. */
const drawnLayers = (svg: string) =>
  [...svg.matchAll(/<path d="M0 0h(\d+)v14H0Z" fill="([^"]*)"/gu)].map(
    (match) => [Number(match[1]), (match[2] ?? "").toUpperCase()] as const,
  );

/** The drawn paths: the 14 px boxes, once each (an item group has the box of its path). */
const squares = (boxes: readonly LayerBox[]) => {
  const own = boxes.filter((box) => box.width === 14 && box.height === 14);
  return own.filter((box, index) => own.findIndex((o) => o.x === box.x && o.y === box.y) === index);
};
/** One box per position: an item group has the box of its path. */
const unique = (boxes: readonly LayerBox[]) =>
  boxes.filter((box, index) => boxes.findIndex((o) => o.x === box.x && o.y === box.y) === index);
const bottom = (box: LayerBox) => box.y + box.height;
const centre = (box: LayerBox) => box.y + box.height / 2;
const lineCentre = (strip: Strip, g: number) => strip.band(g) + strip.bandHeight / 2;
const onLine = (strip: Strip, boxes: readonly LayerBox[], g: number) =>
  squares(boxes).filter((box) => Math.abs(centre(box) - lineCentre(strip, g)) < 1);

describe.each(cases)("the card of %o (%s)", (strip, theme) => {
  test("draws one path in the row ink per logo and the name as text only where there is none", () => {
    const logos = [square, "", square, "", square, square, ""];
    const { svg } = render(strip, theme, withLogos(strip, logos));
    const paths = svg.match(new RegExp(`<path [^>]*fill="${strip.ink[theme]}"[^>]*>`, "giu")) ?? [];
    expect(paths.filter((path) => path.includes(` d="${square}"`))).toHaveLength(4);
    names.forEach((name, index) => {
      expect(svg.includes(`>${name}<`), name).toBe(logos[index] === "");
    });
    expect(svg).not.toContain("Joined names");
  });

  test("draws item k on the line logoLines[k]", () => {
    const { boxes } = render(strip, theme, withLogos(strip, allSquares));
    expect([0, 1, 2, 3].map((g) => onLine(strip, boxes, g).length)).toEqual([1, 2, 2, 2]);
    expect(squares(boxes)).toHaveLength(7);
  });

  test("reads logoLines as a number or its text", () => {
    const text = render(strip, theme, withLogos(strip, allSquares));
    const numbers = render(strip, theme, {
      ...withLogos(strip, allSquares),
      logoLines: lineOfName.map(Number),
    });
    expect(numbers.svg).toBe(text.svg);
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

  test("draws the layers of each item in order with the fill at index 4k+j, an empty fill in the row ink", () => {
    const { svg } = render(
      strip,
      theme,
      withTiles(strip, [
        {
          layers: [
            [layerPath(10), ""],
            [layerPath(9), "#FF0000"],
            [layerPath(8), "#00FF00"],
            [layerPath(7), ""],
          ],
        },
        {
          layers: [
            [layerPath(6), "#0000FF"],
            [layerPath(5), ""],
          ],
        },
        { layers: [[layerPath(4), "#123456"]] },
      ]),
    );
    const ink = strip.ink[theme].toUpperCase();
    expect(drawnLayers(svg)).toEqual([
      [10, ink],
      [9, "#FF0000"],
      [8, "#00FF00"],
      [7, ink],
      [6, "#0000FF"],
      [5, ink],
      [4, "#123456"],
    ]);
  });

  test("reads logoFillsDark in the dark twin only, an empty entry falling back to logoFills", () => {
    const { svg } = render(
      strip,
      theme,
      withTiles(strip, [
        {
          layers: [
            [layerPath(10), "#FF0000", "#AABBCC"],
            [layerPath(9), "#00FF00", ""],
            [layerPath(8), "", "#112233"],
          ],
        },
      ]),
    );
    const ink = strip.ink[theme].toUpperCase();
    expect(drawnLayers(svg)).toEqual(
      theme === "dark"
        ? [
            [10, "#AABBCC"],
            [9, "#00FF00"],
            [8, "#112233"],
          ]
        : [
            [10, "#FF0000"],
            [9, "#00FF00"],
            [8, ink],
          ],
    );
  });

  test("lets logoLayers win over logos, and draws logos alone as before", () => {
    const both = render(strip, theme, {
      ...withTiles(strip, [{ layers: [[layerPath(10), ""]] }, { layers: [] }]),
      logos: [square, square],
    });
    const ink = strip.ink[theme].toUpperCase();
    expect(drawnLayers(both.svg)).toEqual([
      [10, ink],
      [14, ink],
    ]);
    const alone = render(strip, theme, {
      ...withLogos(strip, allSquares),
      logoLayers: [],
      logoFills: [],
    });
    expect(squares(alone.boxes)).toHaveLength(7);
  });

  test("gives slot 4k+4 to the next item and draws no logo for an item without a first layer", () => {
    const { svg, boxes } = render(
      strip,
      theme,
      withTiles(strip, [
        { layers: [[layerPath(10), "#FF0000"]] },
        { layers: [] },
        { layers: [[layerPath(8), "#0000FF"]] },
      ]),
    );
    expect(drawnLayers(svg)).toEqual([
      [10, "#FF0000"],
      [8, "#0000FF"],
    ]);
    expect(unique(boxes.filter((box) => box.height === 14 && box.width === 8))).toHaveLength(1);
    expect(svg).toContain(">Tile1<");
    expect(svg).not.toContain(">Tile0<");
  });

  test("draws the name next to the logo only with logoWithName", () => {
    const tiles: readonly Tile[] = [
      { layers: [[layerPath(10), ""]], withName: true },
      { layers: [[layerPath(9), ""]] },
      { layers: [] },
    ];
    const { svg } = render(strip, theme, withTiles(strip, tiles));
    expect(svg.includes(">Tile0<")).toBe(true);
    expect(svg.includes(">Tile1<")).toBe(false);
    expect(svg.includes(">Tile2<")).toBe(true);
    const missing = render(strip, theme, { ...withTiles(strip, tiles), logoWithName: [] });
    expect(missing.svg.includes(">Tile0<")).toBe(false);
    expect(missing.svg.includes(">Tile2<")).toBe(true);
  });

  test("centres a layered tile on its line by the box of its first layer", () => {
    const { boxes } = render(
      strip,
      theme,
      withTiles(strip, [
        {
          layers: [
            [layerPath(30), ""],
            ["M3 2h8v6H3Z", "#FF0000"],
          ],
          withName: true,
        },
      ]),
    );
    const first = unique(boxes.filter((box) => box.height === 14 && box.width === 30));
    expect(first).toHaveLength(1);
    expect(Math.abs(centre(first[0] as LayerBox) - lineCentre(strip, 0))).toBeLessThan(1);
  });

  test("refuses a fill that is not a colour and writes nothing of it", () => {
    const loaded = loadProfile(strip.template, strip.section, theme);
    const applied = applyDesignProps(loaded, {
      ...strip.base,
      ...withTiles(strip, [{ layers: [[layerPath(10), 'red"/><script>']] }]),
    });
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const result = renderSvg(applied.value, {
      data: sampleProfileData(),
      assets: { fonts: profileFontAssets(strip.template, applied.value) },
      time: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("type");
  });

  test("stays within the budget and half the limits with 12 tiles of 4 widest layers", () => {
    const tile: Tile = {
      layers: [0, 1, 2, 3].map((j) => [widest, j === 0 ? "" : "#336699", "#99CCFF"] as const),
      withName: true,
    };
    const loaded: Design = loadProfile(strip.template, strip.section, theme);
    const long = Array.from(
      { length: 12 },
      (_, index) => `Name ${String(index)} ${"W".repeat(200)}`,
    );
    const applied = applyDesignProps(loaded, {
      ...withTiles(
        strip,
        long.map(() => tile),
        long.map((_, index) => String(index % 4)),
      ),
      logoNames: long,
      logoLabels: ["A", "B", "C", "D"].map((label) => `${label} ${"W".repeat(200)}`),
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
    for (const logo of profileLogos) {
      for (const layer of logo.layers) expect(svg).toContain(` d="${layer.d}"`);
    }
    for (const logo of profileLogos) {
      expect(svg.includes(`>${logo.name}<`), logo.name).toBe(
        logo.layers.length === 0 || logo.withName,
      );
    }
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
      profileLogos.filter((logo) => logo.layers.length > 0).length,
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
      const drawn = logo.layers.length > 0;
      expect(logo.licence.length).toBeGreaterThan(0);
      expect(logo.owner.length).toBeGreaterThan(0);
      expect(logo.trace.length).toBeGreaterThan(0);
      expect(logo.note).toContain("author's responsibility");
      expect(logo.page).toMatch(/^https:\/\/[^\s]+$/u);
      expect(logo.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(logo.source).toMatch(drawn ? /^https:\/\/[^\s]+/u : /^n\/a: .+$/u);
      expect(logo.sha256).toMatch(drawn ? /^[0-9a-f]{64}$/u : /^n\/a: .+$/u);
      if (!drawn) {
        expect(logo.withName).toBe(false);
        expect(logo.trace).toMatch(/^n\/a: /u);
        return;
      }
      expect(logo.layers.length).toBeLessThanOrEqual(4);
      expect(logo.layers.reduce((sum, layer) => sum + layer.d.length, 0)).toBeLessThanOrEqual(6000);
      const boxes = logo.layers.map((layer) => {
        expect(layer.d).toMatch(/^M[MLCZ0-9.\-\s]*Z$/u);
        expect(layer.fill).toMatch(/^(#[0-9a-f]{6})?$/u);
        expect(layer.fillDark).toMatch(/^(#[0-9a-f]{6})?$/u);
        const alone = renderSvg(
          {
            version: 0,
            canvas: { width: 200, height: 40 },
            layers: [{ type: "path", d: layer.d, fill: "#000000" }],
          },
          { time: 0, layerBoxes: true },
        );
        if (!alone.ok) throw new Error(JSON.stringify(alone.issues));
        return alone.layerBoxes?.[0] as LayerBox;
      });
      const [base] = boxes as [LayerBox];
      expect(base.x).toBeGreaterThanOrEqual(-0.05);
      expect(base.y).toBeGreaterThanOrEqual(-0.05);
      expect(base.height).toBeGreaterThanOrEqual(13.5);
      expect(base.height).toBeLessThanOrEqual(14.5);
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(-0.05);
        expect(box.y).toBeGreaterThanOrEqual(-0.05);
        expect(box.x + box.width).toBeLessThanOrEqual(base.x + base.width + 0.25);
        expect(box.y + box.height).toBeLessThanOrEqual(base.y + base.height + 0.25);
      }
    },
  );

  test.each(
    strips.flatMap((strip) =>
      themes.flatMap((theme) =>
        profileLogos.map((logo) => [strip.template, theme, logo.name, strip, logo] as const),
      ),
    ),
  )(
    "%s %s: the fills of %s are legible on the card or are the row ink",
    (_t, theme, _n, strip, logo) => {
      for (const layer of logo.layers) {
        const fill = theme === "dark" && layer.fillDark !== "" ? layer.fillDark : layer.fill;
        if (fill === "") continue;
        expect(contrast(fill, strip.panel[theme])).toBeGreaterThanOrEqual(2);
      }
    },
  );

  test.each(strips)("the card panel of %o is the colour the fills are checked against", (strip) => {
    for (const theme of themes) {
      expect(profileSource(strip.template, strip.section, theme).toLowerCase()).toContain(
        strip.panel[theme].toLowerCase(),
      );
    }
  });

  test("gives the creators no logo", () => {
    for (const name of ["MrBeast", "SpeedSilver", "DiamondXR"]) {
      expect(profileLogos.find((logo) => logo.name === name)?.layers).toEqual([]);
    }
  });

  test("passes the layers of every logo to the example props, padded to 4 per project", () => {
    const padded = (pick: (layer: { d: string; fill: string; fillDark: string }) => string) =>
      profileLogos.flatMap((logo) =>
        [0, 1, 2, 3].map((j) => {
          const layer = logo.layers[j];
          return layer === undefined ? "" : pick(layer);
        }),
      );
    for (const props of [
      profileExampleProps["year-ring"]?.index,
      profileExampleProps.pinscreen?.stack,
    ]) {
      expect(props?.logoLayers).toEqual(padded((layer) => layer.d));
      expect(props?.logoFills).toEqual(padded((layer) => layer.fill));
      expect(props?.logoFillsDark).toEqual(padded((layer) => layer.fillDark));
      expect(props?.logoWithName).toEqual(profileLogos.map((logo) => (logo.withName ? "1" : "")));
      expect(props).not.toHaveProperty("logos");
    }
  });
});

describe("the templates", () => {
  test.each(strips.flatMap((strip) => themes.map((theme) => [strip, theme] as const)))(
    "%o (%s) declare the colour logo props with an empty default",
    (strip, theme) => {
      const design = JSON.parse(profileSource(strip.template, strip.section, theme)) as {
        components: Record<string, { props?: Record<string, { default?: unknown }> }>;
      };
      const declared = Object.values(design.components).flatMap((component) =>
        Object.entries(component.props ?? {}),
      );
      for (const name of ["logoLayers", "logoFills", "logoFillsDark", "logoWithName"]) {
        const found = declared.filter(([key]) => key === name);
        expect(found.length, name).toBeGreaterThan(0);
        for (const [, prop] of found) expect(prop.default).toEqual([]);
      }
    },
  );
});
