# Raster export

`@readmint/raster` turns the renderer's SVG into PNG, WebP, APNG or GIF. It draws the SVG with resvg, the rasterizer
of the golden tests, so a raster image looks like the SVG the renderer wrote; the SVG output itself never changes.
`readmint render --format` ([cli.md](cli.md)) and the Action's `formats` input ([action.md](action.md)) use it.

## Formats

| format | file    | still design             | animated design                                        |
| ------ | ------- | ------------------------ | ------------------------------------------------------ |
| `png`  | `.png`  | PNG                      | a still PNG: the frame at `time`, else the first frame |
| `apng` | `.png`  | PNG (nothing to animate) | animated PNG                                           |
| `webp` | `.webp` | lossless WebP            | animated WebP, every frame lossless                    |
| `gif`  | `.gif`  | GIF                      | animated GIF                                           |

A design is animated when it has an `animation` timeline ([design-format.md](design-format.md#animation)) and no
`time` is asked for; with a `time`, every format writes that one frame as a still image.

PNG, APNG and WebP keep every pixel and its alpha exactly as resvg draws it. GIF has at most 256 colours per frame and
1-bit alpha: each frame gets its own palette (pnnquant over its opaque pixels), a pixel below half opacity is
transparent and any other is drawn opaque in its own colour, so soft edges over a transparent background turn hard.
Give a GIF design a background for smooth edges.

## Options

| option     | CLI            | Action       | default      | range                     |
| ---------- | -------------- | ------------ | ------------ | ------------------------- |
| format     | `--format`     | `formats`    | `svg`        | svg, png, webp, apng, gif |
| scale      | `--scale`      | `scale`      | 2            | 1..4                      |
| frame rate | `--frame-rate` | `frame-rate` | 30, `gif` 25 | 1..60, `gif` 1..50        |

`scale` multiplies the design size: a 420 x 120 design exported at scale 2 is an 840 x 240 image, sharp on high-density
screens. The Action's README snippet gives a raster `<img>` the design's `width` and `height`, so it shows at the
design's size.

## Timing and looping

Frames are sampled at `i * 1000 / frame rate` ms below the duration (`frameTimes` of the renderer); each frame is the
static SVG the renderer draws at that time. Delays are rounded on the timeline, not per frame: each frame ends where the
next one starts, both rounded to the format's unit (milliseconds for WebP and APNG, centiseconds for GIF), so the delays
add up to the duration exactly at any frame rate. A GIF frame shorter than 2 centiseconds (players stretch those to 10)
is dropped and its time goes to the frame before it; this is why GIF stops at 50 frames per second.

Consecutive frames that come out the same merge into one frame with the delays added, so a design that holds still
for part of its timeline costs nothing for it. A GIF also merges frames that its palettes make the same.

| timeline         | APNG          | WebP         | GIF                            |
| ---------------- | ------------- | ------------ | ------------------------------ |
| `loop` (default) | `num_plays` 0 | loop count 0 | NETSCAPE loop count 0          |
| `loop: false`    | `num_plays` 1 | loop count 1 | no NETSCAPE block (plays once) |

A timeline that does not loop ends on its end frame (the frame at the duration), shown after the last sampled frame and
held when the animation stops; its own delay is one frame interval, which only a player that ignores the play count
ever reaches.

APNG frames after the first hold only the rectangle that changed (dispose none, blend source); WebP frames likewise,
with the rectangle's corner on even pixels as WebP requires (no blending, no disposal). GIF frames are full frames
that dispose to the background, so a transparent pixel never shows the frame before it.

## Limits

Every limit that can be known before drawing is checked before the first frame is drawn; the output size is checked
while encoding and stops at the frame that passes it. A failure is a `RasterError` and nothing is returned: the CLI
writes no file (an existing `--out` stays as it was), the Action writes nothing at all. The message names the measured
value, the limit and a fix.

| code                           | limit (`RasterLimits`)                                 | default                                     | fix                                                               |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| `raster-too-large`             | `maxSide`: pixels per side                             | 4096                                        | lower the scale (for example to 1)                                |
| `raster-too-many-frames`       | `maxFrames`: sampled frames                            | 1000                                        | lower the frame rate                                              |
| `raster-too-long`              | `maxDuration`: ms of the timeline                      | 60000                                       | shorten the animation                                             |
| `raster-too-many-pixels`       | `maxTotalPixels`: all frames                           | 268435456                                   | lower the scale or the frame rate                                 |
| `raster-too-many-image-pixels` | `maxImagePixels`: image pixels decoded (below)         | 268435456                                   | draw large images fewer times or smaller, or lower the frame rate |
| `raster-output-too-large`      | `maxOutputBytes`: encoded file                         | 5242880 (5 MiB, GitHub's image proxy limit) | lower the scale or the frame rate, or export SVG                  |
| `raster-font`                  | text needs a TTF, OTF or WOFF font carrying its family |                                             | give the font asset as TTF, OTF or WOFF                           |
| `raster-image`                 | an image resvg or libwebp cannot read                  |                                             | fix or replace the image                                          |
| `raster-options`               | a format, scale, frame rate or time out of range       |                                             |                                                                   |

The fixes are worded for the CLI options (`--scale`, `--frame-rate`) and the Action inputs (`scale`, `frame-rate`)
alike.

resvg decodes an image every time it draws it, in every frame. The renderer writes an image used by several layers (or a
`repeat`) once and draws it with `<use>`, so a small SVG can ask for thousands of decodes. Before the first frame is
drawn, raster export adds up each image's size from its header (PNG, JPEG, GIF, WebP) times the times it is drawn per
frame (every `<use>` that reaches it) times the frames, plus one decode of each distinct WebP image for its swap to PNG
(below), and refuses the export when that passes `maxImagePixels`.

`maxSide` matches the largest canvas side of the design format, so only a scale above 1 can pass it.

## Fonts

resvg loads no system font. It draws text with the fonts the SVG embeds, read only from the `@font-face` rules of its
`<style>` (as the renderer writes them; a data-bound text holding `url(data:font/...)` is text and is never read as a
font), plus any a caller of `exportRaster` passes; the CLI and the Action pass none, so a font the renderer refused to
embed (restricted by its licence) is never drawn. TTF and OTF are drawn as they are; WOFF 1.0 is decoded first (its
header and table directory checked against the file, no table stored larger than it is, all tables together at most
the renderer's `maxFontBytes` before anything inflates, each table inflating to exactly its declared size). WOFF2,
a broken font, or text with no font at all is `raster-font`: raster export never writes blank text.

resvg matches a text's `font-family` against the family name inside the font file (name 16, else 1), while the
renderer writes the asset's `family` (the `font-family-mismatch` warning of [renderer.md](renderer.md) when they
differ). In its own copy of the SVG, raster export sets each text's family to the name inside the font the matching
`@font-face` rule (family, weight, style) embeds, so such a text draws all the same; a text whose family no font
carries is `raster-font`.

## WebP images

resvg 0.x (as in resvg-js and resvg-wasm 2.6.2) cannot decode WebP. Raster export decodes each WebP image of the SVG
with libwebp and swaps it for a PNG of the same pixels, in its own copy of the SVG; an animated WebP becomes its first
frame on a transparent canvas, as a still SVG viewer shows it. Only an `<image>` whose `href` is a WebP data URI is
swapped; the same text in a data-bound text stays text. The WebP structure is read with bounds checks before
anything is decoded (size, the renderer's `maxImageSide` and `maxAnimationFrames`); a malformed file is `raster-image`.
GIF and APNG images draw their first frame, as resvg does.

## API

```ts
import { exportRaster, initRaster, RasterError, RasterLimits } from "@readmint/raster";

const output = await exportRaster(
  { frame: (time) => renderSvg(design, { time }).svg, animation: design.animation },
  { format: "webp", scale: 2, frameRate: 30 },
);
// output: { bytes, format, mimeType, width, height, displayWidth, displayHeight, frames, duration }
```

`frame(time)` returns the renderer's static SVG at `time` ms (or the design's SVG for `undefined`) and throws when it
cannot render. `RasterInput.fonts` adds TTF, OTF or WOFF fonts. `RasterOptions.limits` lowers (or, in tests, raises) a
limit. `format` in the output is `png` for an `apng` request of a still design. The same input gives the same bytes.

`initRaster(wasmDir?)` loads the rasterizer and compiles libwebp once (`exportRaster` calls it itself); a bundle that
ships the modules elsewhere passes their folder: the Action bundle keeps them in `dist/wasm/` (`RasterWasm` names the
files, `resolveRasterWasm()` finds them in `node_modules`). Raster export runs in Node (it reads the modules from disk);
the editor does not use it.

## Dependencies and licences

| package                   | licence                                           | what for                                                                                                                                               |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@resvg/resvg-wasm` 2.6.2 | MPL-2.0 (Rust crates: MIT, Apache-2.0, BSD, Zlib) | the rasterizer: resvg compiled to WebAssembly (2.5 MB), bundleable where the native resvg-js is not                                                    |
| `wasm-webp` 0.1.0         | MIT (libwebp: BSD-3-Clause)                       | lossless WebP encoding and decoding: libwebp 1.3.2 (built from 6c484cbf, which carries the CVE-2023-4863 fix) in WebAssembly, 0.5 MB                   |
| `gifenc` 1.0.3            | MIT                                               | GIF palettes (pnnquant) and LZW encoding, 10 kB of JavaScript                                                                                          |
| `fflate` 0.8.3            | MIT                                               | zlib compression of PNG and APNG, and WOFF inflation: plain JavaScript, so a PNG's bytes depend on its pixels alone, on every machine and Node version |

wasm-webp never frees a decoded image and does not check a failed decode, so each export gets its own libwebp instance
(its memory goes with the export) and a decode that returns the instance's memory at address 0 counts as failed.

PNG and APNG are written by own code (chunks, filters, CRC) on fflate. The Action bundle carries each package's licence
text in its banner, plus the libwebp notice and patent grant for wasm-webp, and for resvg-wasm (which publishes no
licence file) the MPL-2.0 text and the list of Rust crates in its WebAssembly with their licences
(`packages/action/scripts/licences/`).
