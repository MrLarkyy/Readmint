import { parseSfnt } from "@readmint/fonts";
import type { AnimationTrack, Colour, Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { buildTestFont, type TestGlyph } from "../../fonts/test/buildTestFont.js";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets, imageAssets } from "./testAssets.js";

/** The fill every probe layer draws with: present in the SVG exactly when the layer is written. */
const probe = "#c00001";
const other = "#0969da";

function design(layers: readonly Layer[], extra: Partial<Design> = {}): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { fonts: fontAssets, images: imageAssets },
    layers,
    ...extra,
  };
}

function render(input: Design, options: RenderOptions = {}): string {
  const result = renderSvg(input, options);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

function rect(x: number, y: number, extra: Partial<Layer> = {}): Layer {
  return { type: "rect", x, y, width: 50, height: 50, fill: probe, ...extra } as Layer;
}

function clipGroup(x: number, y: number, children: readonly Layer[]): Layer {
  return { type: "group", x, y, width: 50, height: 50, clip: true, children: [...children] };
}

function track<T>(from: T, to: T): AnimationTrack<T> {
  return {
    keyframes: [
      { offset: 0, value: from },
      { offset: 1, value: to },
    ],
  };
}

/** Something on the canvas, so a render is never empty and its own markup stays. */
const anchor = rect(10, 10, { fill: other, width: 10, height: 10 });

describe("a layer of its own wholly outside the canvas is not written", () => {
  test.each<[string, Layer]>([
    ["a clip group below", clipGroup(0, 300, [rect(0, 0)])],
    ["a clip group right", clipGroup(300, 0, [rect(0, 0)])],
    ["a clip group left", clipGroup(-300, 0, [rect(0, 0)])],
    ["a clip group above", clipGroup(0, -300, [rect(0, 0)])],
    ["a clip group just left, inside twice the canvas", clipGroup(-60, 0, [rect(0, 0)])],
    [
      "a far child of a clip group on the canvas",
      { type: "group", width: 100, height: 100, clip: true, children: [rect(300, 0)] },
    ],
    [
      "a clip group on the canvas whose only child is a far clip group",
      {
        type: "group",
        width: 100,
        height: 100,
        clip: true,
        children: [clipGroup(0, 300, [rect(0, 0)])],
      },
    ],
    ["a rect with opacity", rect(0, 300, { opacity: 0.5 })],
    [
      "an ellipse with opacity",
      { type: "ellipse", x: 300, y: 0, width: 40, height: 40, fill: probe, opacity: 0.5 },
    ],
    [
      "a path with opacity",
      { type: "path", x: -300, y: 0, d: "M0 0 L40 0 L40 40 Z", fill: probe, opacity: 0.5 },
    ],
    [
      "a text with opacity",
      { type: "text", x: 0, y: 300, content: "Hi", font: "medium", fill: probe, opacity: 0.5 },
    ],
    [
      "a text drawn as paths with opacity",
      { type: "text", x: 0, y: -300, content: "Hi", font: "paths", fill: probe, opacity: 0.5 },
    ],
    ["a group with opacity", { type: "group", x: 0, y: 300, opacity: 0.5, children: [rect(0, 0)] }],
  ])("%s", (_name, layer) => {
    const svg = render(
      design([anchor, layer], {
        assets: {
          fonts: { ...fontAssets, paths: { ...fontAssets.medium, drawAs: "paths" } },
          images: imageAssets,
        },
      }),
    );
    expect(svg).not.toContain(probe);
    expect(svg).not.toContain("<clipPath");
    expect(svg).not.toContain("aria-label");
    expect(svg).toContain(other);
  });

  test("an image with opacity", () => {
    const svg = render(
      design([
        anchor,
        { type: "image", asset: "png", x: 0, y: 300, width: 24, height: 16, opacity: 0.5 },
      ]),
    );
    expect(svg).not.toContain("<image");
  });

  test("an image drawn as a <use> of shared data, without opacity", () => {
    const image: Layer = { type: "image", asset: "png", x: 0, y: 0, width: 24, height: 16 };
    const svg = render(design([image, { ...image, y: 300 }]));
    expect(svg.match(/<use href="#\w+-s/gu)).toHaveLength(1);
    expect(svg).toContain('y="0"');
    expect(svg).not.toContain('y="300"');
  });

  test("a far clip group inside a clip group on the canvas leaves the outer one and its clip", () => {
    const svg = render(
      design([
        {
          type: "group",
          width: 50,
          height: 50,
          clip: true,
          children: [rect(0, 0, { fill: other }), clipGroup(0, 300, [rect(0, 0)])],
        },
      ]),
    );
    expect(svg).not.toContain(probe);
    expect(svg.match(/<clipPath/gu)).toHaveLength(1);
    expect(svg).toContain(other);
  });

  test("a culled text leaves other texts in the same font drawn and its font embedded", () => {
    const text = (y: number, fill: Colour): Layer => ({
      type: "text",
      x: 10,
      y,
      content: "Hi",
      font: "medium",
      fill,
      opacity: 0.5,
    });
    const svg = render(design([text(300, probe), text(20, other)]));
    expect(svg).not.toContain(probe);
    expect(svg).toContain(other);
    expect(svg).toContain("@font-face");
  });
});

describe("layers on or reaching the canvas are written", () => {
  test.each<[string, Layer]>([
    ["a clip group overlapping the bottom edge", clipGroup(0, 80, [rect(0, 0)])],
    ["a rect with opacity overlapping the right edge", rect(99.5, 0, { opacity: 0.5 })],
    ["a rect with opacity touching the right edge from outside", rect(100, 0, { opacity: 0.5 })],
    [
      "a clip group from the canvas out to twice its width",
      {
        type: "group",
        x: 50,
        y: 0,
        width: 150,
        height: 50,
        clip: true,
        children: [rect(0, 0, { width: 150 })],
      },
    ],
    ["a far rect without opacity (not a layer of its own)", rect(0, 300)],
    [
      "a far image drawn once, without opacity",
      { type: "image", asset: "png", x: 0, y: 300, width: 24, height: 16, alt: probe },
    ],
  ])("%s", (_name, layer) => {
    expect(render(design([layer]))).toContain(probe);
  });

  test("a group turned about its centre keeps a child the turn brings onto the canvas", () => {
    const child = rect(40, 105, { width: 20, height: 20, opacity: 0.5 });
    const unturned: Layer = { type: "group", width: 100, height: 100, children: [child] };
    expect(render(design([unturned]))).not.toContain(probe);
    expect(render(design([{ ...unturned, rotation: 45 }]))).toContain(probe);
  });
});

describe("text is bounded by its glyphs, not its box", () => {
  const text = (x: number): Layer => ({
    type: "text",
    x,
    y: 40,
    width: 5000,
    align: "end",
    content: "Hi",
    font: "medium",
    fontSize: 20,
    fill: probe,
    opacity: 0.5,
  });

  test("right-aligned text in a box wider than the canvas is kept when its glyphs are on it", () => {
    expect(render(design([text(-4920)]))).toContain(probe);
  });

  test("and left out when its glyphs lie beyond the canvas", () => {
    expect(render(design([anchor, text(0)]))).not.toContain(probe);
  });
});

describe("animation", () => {
  const timeline = { animation: { duration: 1000, loop: false } };
  const slideIn = rect(400, 20, { opacity: 0.5, animate: { x: track(0, -390) } });

  test("the animated SVG keeps a far layer its animation brings onto the canvas", () => {
    const svg = render(design([anchor, slideIn], timeline));
    expect(svg).toContain(probe);
    expect(svg).toContain('x="400"');
  });

  test("the animated SVG keeps a still far layer inside an animated group", () => {
    const group: Layer = {
      type: "group",
      animate: { y: track(0, -300) },
      children: [rect(0, 300, { opacity: 0.5 })],
    };
    expect(render(design([anchor, group], timeline))).toContain(probe);
  });

  test("a frame leaves out the layer while its tracks hold it off the canvas", () => {
    const input = design([anchor, slideIn], timeline);
    expect(render(input, { time: 0 })).not.toContain(probe);
    expect(render(input, { time: 1000 })).toContain(probe);
  });

  test("a frame places an opacity track's layer by its sampled transforms", () => {
    const fading = rect(0, 300, {
      animate: { opacity: track(0.2, 1), y: track(0, -290) },
    });
    const input = design([anchor, fading], timeline);
    expect(render(input, { time: 0 })).not.toContain(probe);
    expect(render(input, { time: 1000 })).toContain(probe);
  });

  test("a frame places children by the transforms of an animated group around them", () => {
    const group: Layer = {
      type: "group",
      animate: { y: track(0, -300), rotation: track(0, 10) },
      children: [rect(0, 300, { opacity: 0.5 })],
    };
    const input = design([anchor, group], timeline);
    expect(render(input, { time: 0 })).not.toContain(probe);
    expect(render(input, { time: 1000 })).toContain(probe);
  });
});

describe("tight bounds: turns, glyph boxes and stroke joins", () => {
  const turnedGroup = (child: Layer, rotation = 45): Layer => ({
    type: "group",
    width: 100,
    height: 100,
    rotation,
    opacity: 0.5,
    children: [child],
  });
  const bigText = (x: number): Layer => ({
    type: "text",
    x,
    y: 0,
    content: "Hi",
    font: "medium",
    fontSize: 300,
    fill: probe,
    opacity: 0.5,
  });
  const wideStroke = (x: number): Layer => ({
    type: "path",
    x,
    y: 0,
    d: "M0 0 H40 V40 H0 Z",
    fill: "none",
    stroke: probe,
    strokeWidth: 100,
    opacity: 0.5,
  });
  const src = fontAssets.medium.src;
  const medium = parseSfnt(
    Uint8Array.from(atob(src.slice(src.indexOf(",") + 1)), (char) => char.charCodeAt(0)),
  );
  if (!medium.ok) throw new Error(medium.message);
  // Where the left edge of the head box around the first pen position (x) meets the right edge of the canvas.
  const textEdge = 100 - (300 / medium.font.unitsPerEm) * medium.font.boundingBox.xMin;

  test.each<[string, Layer]>([
    ["a group turned 45 degrees with a far child", turnedGroup(rect(500, 500))],
    ["text of size 300 at x 350", bigText(350)],
    ["a path with stroke 100 at x 300", wideStroke(300)],
  ])("%s is left out", (_name, layer) => {
    const svg = render(design([anchor, layer]));
    expect(svg).not.toContain(probe);
    expect(svg).toContain(other);
  });

  test.each<[string, Layer]>([
    [
      "a child a 30-degree turn brings onto the canvas",
      turnedGroup(rect(95, 60, { width: 20, height: 20 }), 30),
    ],
    ["text whose glyph box just reaches the canvas", bigText(textEdge)],
    ["a path whose stroke reaches the canvas", wideStroke(140)],
    [
      "the same stroke at x 300 as a rounded square: joins at arcs are padded by twice the width",
      {
        ...wideStroke(300),
        d: "M10 0 H30 A10 10 0 0 1 40 10 V30 A10 10 0 0 1 30 40 H10 A10 10 0 0 1 0 30 V10 A10 10 0 0 1 10 0 Z",
      } as Layer,
    ],
  ])("%s is kept", (_name, layer) => {
    expect(render(design([anchor, layer]))).toContain(probe);
  });

  test("text just past the glyph box edge is left out", () => {
    expect(render(design([anchor, bigText(textEdge + 2)]))).not.toContain(probe);
  });

  test("a turned text is bounded by the turn of its glyphs", () => {
    const text: Layer = {
      type: "text",
      x: 0,
      y: 0,
      width: 300,
      content: "Hi",
      font: "medium",
      fontSize: 20,
      fill: probe,
      opacity: 0.5,
    };
    expect(render(design([anchor, text]))).toContain(probe);
    expect(render(design([anchor, { ...text, rotation: 90 }]))).not.toContain(probe);
  });

  test("a frame turns children by the interval of a rotation track", () => {
    const timeline = { animation: { duration: 1000, loop: false } };
    const group = (child: Layer): Layer => ({
      type: "group",
      width: 100,
      height: 100,
      animate: { rotation: track(0, 45) },
      children: [child],
    });
    const far = design([anchor, group(rect(500, 500, { opacity: 0.5 }))], timeline);
    expect(render(far, { time: 1000 })).not.toContain(probe);
    const near = design(
      [anchor, group(rect(40, 105, { width: 20, height: 20, opacity: 0.5 }))],
      timeline,
    );
    expect(render(near, { time: 0 })).not.toContain(probe);
    expect(render(near, { time: 1000 })).toContain(probe);
  });

  describe("with fonts built for the test", () => {
    const square = (
      codePoint: number,
      [xMin, yMin, xMax, yMax]: readonly [number, number, number, number],
    ): TestGlyph => ({
      codePoints: [codePoint],
      advance: 500,
      contours: [
        [
          [xMin, yMin, true],
          [xMax, yMin, true],
          [xMax, yMax, true],
          [xMin, yMax, true],
        ],
      ],
    });
    const asset = (family: string, fallback?: string[]) => ({
      family,
      src: `${family}.ttf`,
      licence: { embedding: "allowed" as const },
      ...(fallback === undefined ? {} : { fallback }),
    });
    const small = buildTestFont({
      family: "Small",
      glyphs: [{ advance: 500 }, square(0x41, [0, 0, 100, 100])],
    });
    const bytes = {
      empty: buildTestFont({
        family: "Empty",
        glyphs: [{ advance: 500 }, { codePoints: [0x41], advance: 500 }],
      }),
      small,
      smallWide: small,
      wide: buildTestFont({
        family: "Wide",
        glyphs: [{ advance: 500 }, square(0x42, [-3000, 0, 100, 100])],
      }),
    };
    const text = (x: number, font: string, content: string, fontSize: number): string =>
      render(
        design(
          [anchor, { type: "text", x, y: 0, content, font, fontSize, fill: probe, opacity: 0.5 }],
          {
            assets: {
              fonts: {
                empty: asset("Empty"),
                small: asset("Small"),
                smallWide: asset("Small", ["wide"]),
                wide: asset("Wide"),
              },
            },
          },
        ),
        { assets: { fonts: bytes } },
      );

    test("a degenerate head box keeps the em box, 1 em left of the pen", () => {
      expect(text(250, "empty", "A", 300)).toContain(probe);
      expect(text(450, "empty", "A", 300)).not.toContain(probe);
    });

    test("a fallback run is bounded by the head box of its own font", () => {
      expect(text(150, "small", "A", 100)).not.toContain(probe);
      expect(text(150, "smallWide", "AB", 100)).toContain(probe);
    });
  });
});

test("layer boxes still list the layers the SVG leaves out", () => {
  const result = renderSvg(design([anchor, clipGroup(0, 300, [rect(0, 0)])]), {
    layerBoxes: true,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(result.svg).not.toContain(probe);
  expect(result.layerBoxes?.map(({ layer, y }) => [layer, y])).toEqual([
    ["/layers/0", 10],
    ["/layers/1", 300],
    ["/layers/1/children/0", 300],
  ]);
});
