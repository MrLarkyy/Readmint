import type { Design, Layer, Paint } from "@readmint/format";
import { defaultNodeTolerance } from "@readmint/golden";
import { comparePng, rasterizeSvg } from "@readmint/golden/node";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderResult } from "../src/index.js";
import { fontAssets, imageAssets } from "./testAssets.js";
import { svgSafetyProblems } from "./svgSafety.js";

const linear: Paint = {
  type: "linear",
  stops: [
    { offset: 0, color: "#0969da" },
    { offset: 1, color: "#bf3989" },
  ],
};
const radial: Paint = {
  type: "radial",
  stops: [
    { offset: 0, color: "#ffffff" },
    { offset: 1, color: "#1a7f37cc" },
  ],
};

function rendered(layers: Layer[], extra: Partial<Design> = {}, count = 5): string {
  const result: RenderResult = renderSvg(
    {
      version: 0,
      canvas: { width: 100, height: 100 },
      assets: { images: imageAssets, fonts: { m: fontAssets.medium } },
      ...extra,
      layers,
    },
    { data: { n: new Array<number>(count).fill(0) } },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(svgSafetyProblems(result.svg)).toEqual([]);
  return result.svg;
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** The ids every `url(#..)` and `href="#.."` refers to, in order. */
function references(svg: string): string[] {
  return [...svg.matchAll(/(?:url\(#|href="#)([^)"]+)/gu)].map((match) => match[1] ?? "");
}

const repeated = { repeat: { each: "{{n}}" } } as const;

describe("gradients", () => {
  test("a repeated rect with one linear gradient defines it once and refers to it from every copy", () => {
    const svg = rendered([{ type: "rect", width: 10, height: 10, fill: linear, ...repeated }]);
    expect(occurrences(svg, "<linearGradient")).toBe(1);
    const refs = references(svg);
    expect(refs).toHaveLength(5);
    expect(new Set(refs).size).toBe(1);
    expect(svg).toContain(`<linearGradient id="${refs[0] ?? ""}"`);
  });

  test("a repeated ellipse with a radial gradient defines it once", () => {
    const svg = rendered([{ type: "ellipse", width: 10, height: 10, fill: radial, ...repeated }]);
    expect(occurrences(svg, "<radialGradient")).toBe(1);
    expect(occurrences(svg, "url(#")).toBe(5);
  });

  test("two different gradients get two definitions", () => {
    const svg = rendered([
      { type: "rect", width: 10, height: 10, fill: linear, ...repeated },
      { type: "rect", width: 10, height: 10, fill: radial, ...repeated },
      { type: "rect", width: 10, height: 10, fill: { ...linear, x2: 0, y2: 1 } },
    ]);
    expect(occurrences(svg, "<linearGradient")).toBe(2);
    expect(occurrences(svg, "<radialGradient")).toBe(1);
    expect(new Set(references(svg)).size).toBe(3);
  });

  test("one gradient as fill, stroke and canvas background is defined once; a text's spans its box", () => {
    const svg = rendered(
      [
        { type: "rect", width: 10, height: 10, fill: linear, stroke: linear, strokeWidth: 2 },
        { type: "text", content: "a", font: "m", fill: linear },
        { type: "text", content: "a", font: "m", fill: linear },
      ],
      { canvas: { width: 100, height: 100, background: linear } },
    );
    expect(occurrences(svg, "<linearGradient")).toBe(2);
    expect(occurrences(svg, 'gradientUnits="userSpaceOnUse"')).toBe(1);
    expect(references(svg)).toHaveLength(5);
    expect(new Set(references(svg)).size).toBe(2);
  });
});

describe("clip paths", () => {
  const clipped = (width: number): Layer => ({
    type: "group",
    width,
    height: 20,
    clip: true,
    children: [{ type: "rect", width: 40, height: 40, fill: "#0969da" }],
    ...repeated,
  });

  test("repeated clipped groups of one size share one clip path", () => {
    const svg = rendered([clipped(20)], {}, 4);
    expect(occurrences(svg, "<clipPath")).toBe(1);
    expect(occurrences(svg, "clip-path=")).toBe(4);
    expect(new Set(references(svg)).size).toBe(1);
  });

  test("two sizes give two clip paths", () => {
    const svg = rendered([clipped(20), clipped(30)], {}, 4);
    expect(occurrences(svg, "<clipPath")).toBe(2);
    expect(new Set(references(svg)).size).toBe(2);
  });
});

describe("images", () => {
  const image = (extra: Partial<Layer> = {}): Layer =>
    ({ type: "image", asset: "png", width: 30, height: 20, fit: "contain", ...extra }) as Layer;
  const png = imageAssets.png.src;

  test("a repeated image writes its data once, one symbol and a use per copy", () => {
    const svg = rendered([image(repeated)], {}, 3);
    expect(occurrences(svg, png.slice(png.indexOf(",") + 1))).toBe(1);
    expect(occurrences(svg, "<image")).toBe(1);
    expect(occurrences(svg, "<symbol")).toBe(1);
    expect(svg).toMatch(
      /<image id="d[0-9a-z]{7}-i[0-9a-z]{7}" width="24" height="16" href="data:image\/png;base64,/u,
    );
    expect(svg).toMatch(
      /<symbol id="d[0-9a-z]{7}-s[0-9a-z]{7}" viewBox="0 0 24 16" preserveAspectRatio="xMidYMid meet"><use href="#d[0-9a-z]{7}-i[0-9a-z]{7}"\/><\/symbol>/u,
    );
    expect(
      svg.match(/<use href="#d[0-9a-z]{7}-s[0-9a-z]{7}" x="0" y="0" width="30" height="20"\/>/gu),
    ).toHaveLength(3);
  });

  test("an image drawn once stays inline", () => {
    const svg = rendered([image({ alt: "a" })]);
    expect(svg).toMatch(
      /<image x="0" y="0" width="30" height="20" preserveAspectRatio="xMidYMid meet" href="data:image\/png;base64,[^"]+" aria-label="a"\/>/u,
    );
    expect(svg).not.toContain("<use");
    expect(svg).not.toContain("<defs>");
  });

  test("two assets with the same bytes share one data URI", () => {
    const svg = rendered([image(), image({ asset: "copy", x: 40 })], {
      assets: { images: { png: imageAssets.png, copy: { src: png } } },
    });
    expect(occurrences(svg, "data:image/png")).toBe(1);
    expect(occurrences(svg, "<symbol")).toBe(1);
    expect(svg.split(/<use href="#d[0-9a-z]{7}-s/u).length - 1).toBe(2);
  });

  test("one asset in two fits has one image definition and a symbol per fit", () => {
    const svg = rendered([image(), image({ fit: "cover", x: 40 }), image({ fit: "fill", y: 40 })]);
    expect(occurrences(svg, "data:image/png")).toBe(1);
    expect(occurrences(svg, "<image id=")).toBe(1);
    expect(occurrences(svg, "<symbol")).toBe(3);
    for (const aspect of ["xMidYMid meet", "xMidYMid slice", "none"]) {
      expect(svg).toMatch(
        new RegExp(`preserveAspectRatio="${aspect}"><use href="#d[0-9a-z]{7}-i`, "u"),
      );
    }
  });

  test("the alt of a shared image is escaped and gets the img role", () => {
    const svg = rendered([image({ alt: 'a <b> & "c"', ...repeated })], {}, 2);
    expect(occurrences(svg, ' role="img" aria-label="a &lt;b&gt; &amp; &quot;c&quot;"')).toBe(2);
  });

  test("rotation and opacity of a shared image go on its use, turning around the box centre", () => {
    const svg = rendered([image({ x: 10, y: 20, rotation: 30, opacity: 0.5, ...repeated })], {}, 2);
    expect(
      svg.match(
        /<use href="#d[0-9a-z]{7}-s[0-9a-z]{7}" x="10" y="20" width="30" height="20" opacity="0.5" transform="rotate\(30 25 30\)"\/>/gu,
      ),
    ).toHaveLength(2);
  });

  test("shared images draw like inline ones in every fit, rotated and faded", () => {
    const layers = [
      image({ x: 4, y: 4, width: 40, height: 24, fit: "contain" }),
      image({ x: 52, y: 4, width: 16, height: 30, fit: "cover" }),
      image({ x: 4, y: 40, width: 30, height: 12, fit: "fill", opacity: 0.6 }),
      image({ x: 44, y: 44, width: 36, height: 20, fit: "cover", rotation: 25 }),
    ];
    const svg = rendered(layers);
    expect(svg.split(/<use href="#d[0-9a-z]{7}-s/u).length - 1).toBe(4);
    // The inline form of the same picture: every <use> replaced by the <image> one use alone would write.
    const data = /href="(data:[^"]+)"/u.exec(svg)?.[1] ?? "";
    const aspects = new Map(
      [...svg.matchAll(/<symbol id="([^"]+)"[^>]* preserveAspectRatio="([^"]+)">/gu)].map(
        (match) => [match[1] ?? "", match[2] ?? ""],
      ),
    );
    const inline = svg
      .replace(/<defs>.*<\/defs>/u, "")
      .replace(
        /<use href="#([^"]+)" (x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*")/gu,
        (_all, id: string, box: string) =>
          `<image ${box} preserveAspectRatio="${aspects.get(id) ?? ""}" href="${data}"`,
      );
    expect(inline).not.toContain("<use");
    // The golden tolerance: the clip of a rotated cover image anti-aliases its edge pixels a shade apart.
    const comparison = comparePng(
      rasterizeSvg(inline, 4),
      rasterizeSvg(svg, 4),
      defaultNodeTolerance,
    );
    expect(comparison.diffPixels).toBe(0);
  });
});

describe("report", () => {
  const twice = (asset: string): Layer => ({
    type: "image",
    asset,
    width: 10,
    height: 10,
    ...repeated,
  });

  test("the data of a repeated image counts once", () => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 10, height: 10 },
        assets: { images: { png: imageAssets.png, copy: { src: imageAssets.png.src } } },
        layers: [twice("png"), twice("copy")],
      },
      { data: { n: [0, 0, 0] } },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const dataUri = /href="(data:[^"]+)"/u.exec(result.svg)?.[1] ?? "";
    expect(result.report.images).toEqual([
      { asset: "png", bytes: dataUri.length },
      { asset: "copy", bytes: 0 },
    ]);
    const images = result.report.images.reduce((sum, { bytes }) => sum + bytes, 0);
    expect(images).toBeLessThanOrEqual(result.report.bytes);
  });
});
