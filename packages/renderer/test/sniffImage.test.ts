import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { sniffImage } from "../src/sniffImage.js";

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
    expect(sniffImage(data, 1000)).toEqual({ ok: true, info: { mime, width, height, frames } });
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

  test("supplied bytes win over the path and are capped too", () => {
    expect(render("img/a.png", { assets: { images: { i: png } } }).ok).toBe(true);
    expect(
      render("img/a.png", { assets: { images: { i: png } }, limits: { maxImageBytes: 10 } }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/images/i", code: "asset-too-large" }],
    });
  });

  test("the byte cap is checked before decoding", () => {
    const huge = `data:image/png;base64,${"A".repeat(8_000_000)}`;
    const started = performance.now();
    expect(render(huge)).toMatchObject({ ok: false, issues: [{ code: "asset-too-large" }] });
    expect(performance.now() - started).toBeLessThan(200);
  });
});
