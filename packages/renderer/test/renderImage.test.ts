import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design, ImageLayer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { sniffImage } from "../src/sniffImage.js";
import {
  dataUriBytes,
  jpegWithExif,
  orientationTiff,
  pngWithExif,
  toDataUri,
  webpWithExif,
} from "./exifImages.js";

const assets = join(import.meta.dirname, "assets");
const png = new Uint8Array(readFileSync(join(assets, "pattern.png")));
const jpeg = new Uint8Array(readFileSync(join(assets, "gradient.jpg")));

const orientedPng = (orientation: number) =>
  toDataUri("image/png", pngWithExif(png, orientationTiff(orientation)));

const oriented: Readonly<Record<string, (orientation: number) => string>> = {
  png: orientedPng,
  jpeg: (orientation) =>
    toDataUri("image/jpeg", jpegWithExif(jpeg, orientationTiff(orientation, true))),
  webp: (orientation) => toDataUri("image/webp", webpWithExif(orientationTiff(orientation))),
};

function render(src: string, layer: Partial<ImageLayer> = {}, copies = 1): string {
  const design: Design = {
    version: 0,
    canvas: { width: 50, height: 50 },
    assets: { images: { i: { src } } },
    layers: [
      {
        type: "image",
        asset: "i",
        x: 5,
        y: 7,
        width: 30,
        height: 20,
        ...(copies > 1 ? { repeat: { each: `{{[${"1,".repeat(copies - 1)}1]}}` } } : {}),
        ...layer,
      },
    ],
  };
  const result = renderSvg(design, {});
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

/** Each `<image>` element without its data. */
const images = (svg: string): string[] =>
  [...svg.matchAll(/<image [^>]*\/>/gu)].map(([element]) => element.replace(/ href="[^"]*"/u, ""));

describe("EXIF orientation on an inline image", () => {
  const contained: Readonly<Record<number, string>> = {
    1: `<image x="5" y="7" width="30" height="20" preserveAspectRatio="xMidYMid meet"/>`,
    3: `<image x="0" y="0" width="30" height="20" preserveAspectRatio="xMidYMid meet" transform="matrix(-1 0 0 -1 35 27)"/>`,
    6: `<image x="0" y="0" width="20" height="30" preserveAspectRatio="xMidYMid meet" transform="matrix(0 1 -1 0 35 7)"/>`,
    8: `<image x="0" y="0" width="20" height="30" preserveAspectRatio="xMidYMid meet" transform="matrix(0 -1 1 0 5 27)"/>`,
  };

  test.each(
    ["png", "jpeg", "webp"].flatMap((format) =>
      [1, 3, 6, 8].map((orientation) => [format, orientation] as const),
    ),
  )("%s, orientation %i, contain", (format, orientation) => {
    expect(images(render(oriented[format]?.(orientation) ?? ""))).toEqual([contained[orientation]]);
  });

  test.each([
    [2, 30, 20, "-1 0 0 1 35 7"],
    [4, 30, 20, "1 0 0 -1 5 27"],
    [5, 20, 30, "0 1 1 0 5 7"],
    [7, 20, 30, "0 -1 -1 0 35 27"],
  ])("orientation %i maps the box onto the layer's", (orientation, width, height, matrix) => {
    expect(images(render(orientedPng(orientation), { fit: "cover" }))).toEqual([
      `<image x="0" y="0" width="${String(width)}" height="${String(height)}" preserveAspectRatio="xMidYMid slice" transform="matrix(${matrix})"/>`,
    ]);
  });

  test.each([
    ["a sixth Exif prefix byte other than 0", { sixthByte: 1 }],
    ["stray bytes before its Exif segment, after the frame header", { afterFrame: [0, 0x2a] }],
    ["FF 00 before its Exif segment, after the frame header", { afterFrame: [0, 0xff, 0] }],
  ])("a JPEG with %s is oriented, as Chromium does", (_name, options) => {
    const src = toDataUri("image/jpeg", jpegWithExif(jpeg, orientationTiff(6), options));
    expect(images(render(src, { fit: "fill" }))).toEqual([
      `<image x="0" y="0" width="20" height="30" preserveAspectRatio="none" transform="matrix(0 1 -1 0 35 7)"/>`,
    ]);
  });

  test("the layer's rotation turns the oriented image around the layer's centre", () => {
    expect(
      images(render(orientedPng(6), { rotation: 20, opacity: 0.5, alt: "a <photo>" })),
    ).toEqual([
      `<image x="0" y="0" width="20" height="30" preserveAspectRatio="xMidYMid meet" aria-label="a &lt;photo&gt;" opacity="0.5" transform="rotate(20 20 17) matrix(0 1 -1 0 35 7)"/>`,
    ]);
  });

  test("the inlined data says orientation 1; the asset's bytes are left alone", () => {
    const src = orientedPng(6);
    const svg = render(src);
    const href = /href="([^"]*)"/u.exec(svg)?.[1] ?? "";
    const inlined = dataUriBytes(href);
    const sniffed = sniffImage(inlined, 1000);
    expect(sniffed).toMatchObject({ ok: true, info: { exif: true, orientation: 1 } });
    expect(inlined.length).toBe(dataUriBytes(src).length);
    expect(sniffImage(dataUriBytes(src), 1000)).toMatchObject({
      ok: true,
      info: { orientation: 6 },
    });
  });

  test("supplied bytes are never changed", () => {
    const supplied = pngWithExif(png, orientationTiff(6));
    const before = supplied.slice();
    const design: Design = {
      version: 0,
      canvas: { width: 50, height: 50 },
      assets: { images: { i: { src: "photo.png" } } },
      layers: [{ type: "image", asset: "i", width: 30, height: 20 }],
    };
    const result = renderSvg(design, { assets: { images: { i: supplied } } });
    expect(result.ok && result.svg).toContain(`transform="matrix(0 1 -1 0 30 0)"`);
    expect(supplied).toEqual(before);
  });

  test("drawn twice, an oriented image stays inline and oriented in both places", () => {
    const svg = render(orientedPng(6), {}, 2);
    expect(svg).not.toMatch(/<use|<symbol|<defs>/u);
    expect(images(svg)).toEqual([
      `<image x="0" y="0" width="20" height="30" preserveAspectRatio="xMidYMid meet" transform="matrix(0 1 -1 0 35 7)"/>`,
      `<image x="0" y="0" width="20" height="30" preserveAspectRatio="xMidYMid meet" transform="matrix(0 1 -1 0 35 7)"/>`,
    ]);
  });

  test("an oriented image renders the same bytes every time", () => {
    const src = orientedPng(6);
    const first = render(src, { rotation: 20 });
    render(orientedPng(8));
    expect(render(src, { rotation: 20 })).toBe(first);
  });
});
