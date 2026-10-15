import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { sniffImage } from "../src/sniffImage.js";
import { jpegWithExif, orientationTiff, pngWithExif, vp8x, webpWithExif } from "./exifImages.js";
import { acceptedJpegs, refusedJpegs } from "./jpegMarkers.js";

const assets = join(import.meta.dirname, "assets");
const read = (name: string) => new Uint8Array(readFileSync(join(assets, name)));
const png = read("pattern.png");
const jpeg = read("gradient.jpg");
const webp = read("tall.webp");
const gif = read("two-frames.gif");

function bytes(...parts: (number[] | string)[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? Array.from(part, (char) => char.charCodeAt(0)) : part,
    ),
  );
}

const u32be = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
const u32le = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
];
const u24le = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255];

function pngHeader(width: number, height: number, chunks: number[] = []): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    "IHDR",
    u32be(width),
    u32be(height),
    [8, 6, 0, 0, 0],
    u32be(0),
    chunks,
  );
}

function apng(frames: number): Uint8Array {
  return pngHeader(4, 4, [
    ...u32be(8),
    ..."acTL".split("").map((c) => c.charCodeAt(0)),
    ...u32be(frames),
    ...u32be(0),
    ...u32be(0),
    ...u32be(0),
    ..."IDAT".split("").map((c) => c.charCodeAt(0)),
  ]);
}

function gifWithFrames(frames: number): Uint8Array {
  const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0, 0];
  return bytes(
    "GIF89a",
    [1, 0, 1, 0, 0, 0, 0],
    Array.from({ length: frames }, () => frame).flat(),
    [0x3b],
  );
}

function animatedWebp(frames: number): Uint8Array {
  const anmf = [..."ANMF".split("").map((c) => c.charCodeAt(0)), ...u32le(0)];
  return bytes(
    "RIFF",
    u32le(0),
    "WEBP",
    "VP8X",
    u32le(10),
    [0x02, 0, 0, 0],
    u24le(9),
    u24le(9),
    Array.from({ length: frames }, () => anmf).flat(),
  );
}

describe("dimensions per format", () => {
  test.each([
    ["png", png, "image/png", 24, 16, 1],
    ["jpeg", jpeg, "image/jpeg", 32, 16, 1],
    ["webp (VP8X)", webp, "image/webp", 16, 32, 1],
    ["gif", gif, "image/gif", 16, 16, 2],
    ["apng", apng(3), "image/png", 4, 4, 3],
    ["animated webp", animatedWebp(2), "image/webp", 10, 10, 2],
  ])("%s", (_name, data, mime, width, height, frames) => {
    expect(sniffImage(data, 1000)).toEqual({
      ok: true,
      info: { mime, width, height, frames, exif: false, orientation: 1, orientationFields: [] },
    });
  });

  test("lossy and lossless WebP headers", () => {
    const vp8 = bytes(
      "RIFF",
      u32le(0),
      "WEBP",
      "VP8 ",
      u32le(10),
      [0, 0, 0, 0x9d, 0x01, 0x2a],
      [20, 0, 30, 0],
    );
    expect(sniffImage(vp8, 10)).toMatchObject({ ok: true, info: { width: 20, height: 30 } });
    const bits = (40 - 1) | ((50 - 1) << 14);
    const vp8l = bytes("RIFF", u32le(0), "WEBP", "VP8L", u32le(5), [0x2f], u32le(bits));
    expect(sniffImage(vp8l, 10)).toMatchObject({ ok: true, info: { width: 40, height: 50 } });
  });
});

/** `data` with `insert` placed at `offset`. */
function spliced(data: Uint8Array, offset: number, insert: Uint8Array): Uint8Array {
  return bytes([...data.subarray(0, offset)], [...insert], [...data.subarray(offset)]);
}

const exifPayload = bytes("Exif", [0, 0], "MM", [0, 42], u32be(8));
/** An APP1 segment: `Exif\0\0` and a TIFF header, or XMP, which is no EXIF. */
const app1 = (payload: Uint8Array) =>
  bytes([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255], [...payload]);
const pngChunk = (type: string, data: Uint8Array) =>
  bytes(u32be(data.length), type, [...data], u32be(0));
/** Offset of the first SOS segment of the test JPEG: the frame header lies before it. */
const jpegScan = jpeg.findIndex((byte, index) => byte === 0xff && jpeg[index + 1] === 0xda);
const pngIend = png.length - 12;

const exifJpeg = spliced(jpeg, 2, app1(exifPayload));
const exifPng = spliced(png, 33, pngChunk("eXIf", exifPayload.subarray(6)));

describe("EXIF data", () => {
  test.each([
    ["jpeg with an Exif APP1 first", exifJpeg, true],
    [
      "jpeg with an Exif APP1 after the frame header",
      spliced(jpeg, jpegScan, app1(exifPayload)),
      true,
    ],
    [
      "jpeg with an XMP APP1",
      spliced(jpeg, 2, app1(bytes("http://ns.adobe.com/xap/1.0/", [0]))),
      false,
    ],
    [
      "jpeg with a cut-off APP1 after the frame header",
      bytes([...jpeg.subarray(0, jpegScan)], [0xff, 0xe1, 0, 20, 0x45]),
      false,
    ],
    ["png with eXIf before the data", exifPng, true],
    [
      "png with eXIf after the data",
      spliced(png, pngIend, pngChunk("eXIf", exifPayload.subarray(6))),
      true,
    ],
    ["png cut off after its data", png.subarray(0, pngIend - 3), false],
    ["webp with the VP8X EXIF flag", vp8x(0x08), true],
    ["webp with an EXIF chunk but no flag", vp8x(0, bytes("EXIF", u32le(0))), true],
    ["webp VP8X without EXIF", vp8x(0, bytes("XMP ", u32le(0))), false],
    ["gif", gif, false],
  ])("%s", (_name, data, exif) => {
    expect(sniffImage(data, 1000)).toMatchObject({ ok: true, info: { exif } });
  });
});

describe("EXIF orientation", () => {
  test.each([1, 3, 6, 8])("orientation %i", (orientation) => {
    const block = orientationTiff(orientation);
    for (const data of [
      jpegWithExif(jpeg, block),
      jpegWithExif(jpeg, orientationTiff(orientation, true)),
      pngWithExif(png, block),
      pngWithExif(png, block, "after-data"),
      webpWithExif(block),
    ]) {
      expect(sniffImage(data, 1000)).toMatchObject({
        ok: true,
        info: { exif: true, orientation, orientationFields: [{ orientation }] },
      });
    }
  });

  test.each([
    ["a sixth Exif prefix byte other than 0", { sixthByte: 1 }],
    ["an Exif segment after stray bytes behind the frame header", { afterFrame: [0, 0x2a, 0] }],
    ["both", { sixthByte: 0xff, afterFrame: [1] }],
    // Checked against Chromium (libjpeg-turbo): each of these still reads the Exif segment after it.
    ["FF 00 (a stuffed zero) after the frame header", { afterFrame: [0xff, 0] }],
    ["FF 00 and more stray bytes", { afterFrame: [0xff, 0, 0x12, 0x34] }],
    ["fill bytes before FF 00", { afterFrame: [0xff, 0xff, 0] }],
    ["a stray byte before FF 00", { afterFrame: [0, 0xff, 0] }],
    ["FF 00 twice", { afterFrame: [0xff, 0, 0xff, 0] }],
    ["stray, fill and FF 00 mixed", { afterFrame: [0x12, 0xff, 0xff, 0xff, 0, 0x34] }],
  ])("a JPEG with %s is read as Chromium reads it", (_name, options) => {
    expect(sniffImage(jpegWithExif(jpeg, orientationTiff(6), options), 1000)).toMatchObject({
      ok: true,
      info: { width: 32, height: 16, exif: true, orientation: 6, orientationFields: [{}] },
    });
  });

  test("stray bytes before the frame header are still refused", () => {
    // After the first segment (before the frame header), so the magic bytes still say JPEG.
    const second = 4 + (((jpeg[4] ?? 0) << 8) | (jpeg[5] ?? 0));
    expect(jpegScan).toBeGreaterThan(second);
    const data = spliced(jpeg, second, bytes([0x2a]));
    expect(sniffImage(data, 1000)).toMatchObject({
      ok: false,
      message: "JPEG segment does not start with 0xFF",
    });
  });

  test.each([
    ["stray bytes", [0x2a]],
    ["stuffed zeros", [0xff, 0]],
    ["fill bytes", [0xff]],
  ])("%s up to the end after the frame header end the walk", (_name, pattern) => {
    const tail = Array.from(
      { length: 100_000 },
      (_, index) => pattern[index % pattern.length] ?? 0,
    );
    const data = bytes([...jpeg.subarray(0, jpegScan)], tail);
    expect(sniffImage(data, 1000)).toMatchObject({ ok: true, info: { width: 32, height: 16 } });
  });

  test("FF 00 before the frame header is refused, like any stray bytes there", () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0], [...jpeg.subarray(2)]), 1000)).toMatchObject({
      ok: false,
      message: "JPEG segment does not start with 0xFF",
    });
  });

  test("stored width and height stay as they are", () => {
    expect(sniffImage(pngWithExif(png, orientationTiff(6)), 1000)).toMatchObject({
      ok: true,
      info: { width: 24, height: 16, orientation: 6 },
    });
  });

  test("where each block lies, and the PNG chunk its CRC covers", () => {
    const result = sniffImage(pngWithExif(png, orientationTiff(6)), 1000);
    // The eXIf chunk follows IHDR at 33: its type at 37, its data (the TIFF block) at 41, its 26 bytes end at 67.
    expect(result).toMatchObject({
      ok: true,
      info: { orientationFields: [{ entries: [51], checksum: { start: 37, end: 67 } }] },
    });
    const jpegResult = sniffImage(jpegWithExif(jpeg, orientationTiff(6)), 1000);
    // APP1 at 2, its length at 4, "Exif" + two zero bytes at 6, the TIFF block at 12, IFD0 entry at 12 + 10.
    expect(jpegResult.ok && jpegResult.info.orientationFields).toEqual([
      { orientation: 6, littleEndian: false, entries: [22] },
    ]);
  });

  test.each([
    ["png", pngWithExif(pngWithExif(png, orientationTiff(6), "after-data"), orientationTiff(3))],
    ["jpeg", jpegWithExif(jpegWithExif(jpeg, orientationTiff(6)), orientationTiff(3))],
    ["webp", webpWithExif(orientationTiff(3), orientationTiff(6))],
  ])("in a %s with two blocks the first in the file wins; both are found", (_name, data) => {
    expect(sniffImage(data, 1000)).toMatchObject({
      ok: true,
      info: { orientation: 3, orientationFields: [{ orientation: 3 }, { orientation: 6 }] },
    });
  });

  test.each([
    ["png", png],
    ["jpeg", jpeg],
    ["webp", webp],
    ["gif", gif],
    ["jpeg with an Exif block without orientation", exifJpeg],
    ["png with an eXIf chunk without orientation", exifPng],
    ["webp with only the EXIF flag", vp8x(0x08)],
  ])("%s is orientation 1", (_name, data) => {
    expect(sniffImage(data, 1000)).toMatchObject({
      ok: true,
      info: { orientation: 1, orientationFields: [] },
    });
  });

  test("an eXIf chunk cut off before its CRC is not rewritable and does not count", () => {
    const data = pngWithExif(png, orientationTiff(6), "after-data").subarray(
      0,
      png.length - 12 + 36,
    );
    expect(sniffImage(data, 1000)).toMatchObject({
      ok: true,
      info: { exif: true, orientation: 1, orientationFields: [] },
    });
  });
});

const refusedJpegRows = refusedJpegs(jpeg);
const refusedJpeg = (name: string) => {
  const row = refusedJpegRows.find((candidate) => candidate.name === name);
  if (row === undefined) throw new Error(`no refused JPEG "${name}"`);
  return row.bytes;
};

describe("JPEG marker rules", () => {
  test.each(refusedJpegRows.map((row) => [row.name, row.bytes, row.message] as const))(
    "a JPEG with %s is refused",
    (_name, data, message) => {
      const result = sniffImage(data, 1000);
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.message).toContain(message);
    },
  );

  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "%s is read at its header size",
    (_name, data) => {
      expect(sniffImage(data, 1000)).toMatchObject({
        ok: true,
        info: { mime: "image/jpeg", width: 32, height: 16 },
      });
    },
  );

  test("a frame header cut off at its sample precision is truncated", () => {
    const frame = jpeg.findIndex((byte, index) => byte === 0xff && jpeg[index + 1] === 0xc0);
    expect(frame).toBeGreaterThan(0);
    expect(sniffImage(jpeg.subarray(0, frame + 4), 1000)).toEqual({
      ok: false,
      message: "the image data is truncated",
    });
  });
});

describe("refused input", () => {
  test.each([
    ["svg markup", bytes('  <svg xmlns="http://www.w3.org/2000/svg"/>'), "SVG images are refused"],
    ["svg with xml prolog", bytes("<?xml version='1.0'?><svg/>"), "SVG images are refused"],
    ["unknown magic", bytes("BM", [0, 0, 0, 0]), "not a PNG, JPEG, GIF or WebP"],
    ["truncated png", png.subarray(0, 20), "truncated"],
    ["truncated jpeg walk", jpeg.subarray(0, 30), "truncated"],
    ["jpeg without frame header", bytes([0xff, 0xd8, 0xff, 0xda, 0, 2]), "no frame header"],
    ["jpeg zero segment length", bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "length is invalid"],
    ["gif without image", bytes("GIF89a", [1, 0, 1, 0, 0, 0, 0, 0x3b]), "no image"],
  ])("%s", (_name, data, message) => {
    const result = sniffImage(data, 1000);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain(message);
  });

  test("a JPEG made only of fill bytes and markers ends", () => {
    const data = new Uint8Array(200_000).fill(0xff);
    data.set([0xff, 0xd8], 0);
    expect(sniffImage(data, 1000)).toMatchObject({ ok: false });
  });

  test("frame counting stops one past the limit", () => {
    expect(sniffImage(gifWithFrames(20), 5)).toMatchObject({ ok: true, info: { frames: 6 } });
    expect(sniffImage(apng(1_000_000), 1000)).toMatchObject({ ok: true, info: { frames: 1001 } });
    expect(sniffImage(animatedWebp(30), 5)).toMatchObject({ ok: true, info: { frames: 6 } });
  });
});

describe("rendered images", () => {
  function render(src: string, options: RenderOptions = {}) {
    const design: Design = {
      version: 0,
      canvas: { width: 50, height: 50 },
      assets: { images: { i: { src } } },
      layers: [{ type: "image", asset: "i", width: 10, height: 10, fit: "cover" }],
    };
    return renderSvg(design, options);
  }
  const uri = (mime: string, data: Uint8Array) =>
    `data:${mime};base64,${Buffer.from(data).toString("base64")}`;

  test("WebP is inlined with its sniffed type", () => {
    const result = render(uri("image/webp", webp));
    expect(result.ok && result.svg).toMatch(
      /<image x="0" y="0" width="10" height="10" preserveAspectRatio="xMidYMid slice" href="data:image\/webp;base64,UklGR/u,
    );
    expect(result.ok && result.report.images).toEqual([
      { asset: "i", bytes: uri("image/webp", webp).length },
    ]);
  });

  test.each([
    ["mime mismatch", uri("image/png", jpeg), {}, "/assets/images/i/src", "asset-format"],
    ["svg bytes", uri("image/png", bytes("<svg/>")), {}, "/assets/images/i/src", "asset-format"],
    [
      "jpeg with a second SOI after its frame header",
      uri("image/jpeg", refusedJpeg("a second SOI after the frame header")),
      {},
      "/assets/images/i/src",
      "asset-format",
    ],
    [
      "jpeg with FF 02 after its frame header",
      uri("image/jpeg", refusedJpeg("FF 02 after the frame header")),
      {},
      "/assets/images/i/src",
      "asset-format",
    ],
    [
      "over the byte cap",
      uri("image/png", png),
      { limits: { maxImageBytes: 100 } },
      "/assets/images/i/src",
      "asset-too-large",
    ],
    [
      "side over 8192",
      uri(
        "image/png",
        pngHeader(8193, 1, [...u32be(0), ..."IDAT".split("").map((c) => c.charCodeAt(0))]),
      ),
      {},
      "/assets/images/i",
      "asset-too-large",
    ],
    [
      "too many frames",
      uri("image/gif", gifWithFrames(3)),
      { limits: { maxAnimationFrames: 2 } },
      "/assets/images/i",
      "asset-too-large",
    ],
    ["path without bytes", "img/a.png", {}, "/assets/images/i/src", "missing-asset"],
  ] as const)("%s", (_name, src, options, path, code) => {
    expect(render(src, options)).toMatchObject({ ok: false, issues: [{ path, code }] });
  });

  test("a src bound to data without bytes names who supplies them (RM-28)", () => {
    const result = render("{{ github.avatarUrl }}", { data: { github: { avatarUrl: "x" } } });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/images/i/src", code: "missing-asset" }],
    });
    expect(!result.ok && result.issues[0]?.message).toBe(
      'image asset "i" takes its src from data ("{{ github.avatarUrl }}"); its bytes must be supplied (the CLI fetches them with --fetch-images, the Action always)',
    );
  });

  test("bytes supplied for a bound src render exactly as for a path (RM-28)", () => {
    const bound = render("{{ github.avatarUrl }}", { assets: { images: { i: png } } });
    const file = render("img/a.png", { assets: { images: { i: png } } });
    expect(bound.ok && bound.svg).toMatch(/href="data:image\/png;base64,/u);
    expect(bound.ok && bound.svg).toBe(file.ok && file.svg);
  });

  test("supplied bytes win over the path and are capped too", () => {
    expect(render("img/a.png", { assets: { images: { i: png } } }).ok).toBe(true);
    expect(
      render("img/a.png", { assets: { images: { i: png } }, limits: { maxImageBytes: 10 } }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/images/i", code: "asset-too-large" }],
    });
  });

  test.each([
    ["jpeg", "image/jpeg", exifJpeg],
    ["png", "image/png", exifPng],
    ["webp", "image/webp", vp8x(0x08)],
  ])("a %s with EXIF data drawn twice stays inline in both places", (_name, mime, data) => {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 50, height: 50 },
        assets: { images: { i: { src: uri(mime, data) }, j: { src: uri(mime, data) } } },
        layers: [
          { type: "image", asset: "i", width: 10, height: 10, repeat: { each: "{{[1, 2]}}" } },
          { type: "image", asset: "j", width: 10, height: 10 },
        ],
      },
      {},
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.svg).not.toMatch(/<use|<symbol|<defs>/u);
    expect(
      result.svg.match(
        /<image x="0" y="0" width="10" height="10" preserveAspectRatio="xMidYMid meet" href="data:/gu,
      ),
    ).toHaveLength(3);
    const length = uri(mime, data).length;
    expect(result.report.images).toEqual([
      { asset: "i", bytes: 2 * length },
      { asset: "j", bytes: length },
    ]);
  });

  test("the byte cap is checked before decoding", () => {
    const huge = `data:image/png;base64,${"A".repeat(8_000_000)}`;
    const started = performance.now();
    expect(render(huge)).toMatchObject({ ok: false, issues: [{ code: "asset-too-large" }] });
    expect(performance.now() - started).toBeLessThan(200 * loadScale());
  });
});
