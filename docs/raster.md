# Output formats

`@readmint/raster` turns the renderer's SVG into PNG, WebP, APNG or GIF. It draws the SVG with resvg, the rasterizer
of the golden tests, so a raster image looks like the SVG the renderer wrote; the SVG output itself never changes.
`readmint render --format` ([cli.md](cli.md)) and the Action's `formats` input ([action.md](action.md)) use it.

## Formats

| format | file    | still design               | animated design                                              |
| ------ | ------- | -------------------------- | ------------------------------------------------------------ |
| `png`  | `.png`  | PNG                        | a still PNG: the frame at `time`, else the first frame       |
| `apng` | `.png`  | PNG (nothing to animate)   | animated PNG                                                 |
| `webp` | `.webp` | WebP (lossless by default) | animated WebP, every frame lossless, or lossy with `quality` |
| `gif`  | `.gif`  | GIF                        | animated GIF                                                 |

A design is animated when it has an `animation` timeline ([design-format.md](design-format.md#animation)) and no
`time` is asked for; with a `time`, every format writes that one frame as a still image.

PNG, APNG and WebP keep every pixel and its alpha exactly as resvg draws it, except WebP with a `quality`, which is lossy: its pixels approximate resvg's drawing (the alpha channel stays exact). GIF has at most 256 colours per frame and
1-bit alpha: each frame gets its own palette (pnnquant over its opaque pixels), a pixel below half opacity is
transparent and any other is drawn opaque in its own colour, so soft edges over a transparent background turn hard.
Give a GIF design a background for smooth edges.

## Options

| option     | CLI            | Action       | default                       | range                     |
| ---------- | -------------- | ------------ | ----------------------------- | ------------------------- |
| format     | `--format`     | `formats`    | `svg`                         | svg, png, webp, apng, gif |
| scale      | `--scale`      | `scale`      | 2                             | 1..4                      |
| frame rate | `--frame-rate` | `frame-rate` | 30, `gif` 25, or lower to fit | 1..60, `gif` 1..50        |
| quality    | `--quality`    | `quality`    | lossless                      | 1..100, `webp` only       |

`scale` multiplies the design size: a 420 x 120 design exported at scale 2 is an 840 x 240 image, sharp on high-density
screens. The Action's README snippet gives a raster `<img>` the design's `width` and `height`, so it shows at the
design's size.

`quality` switches WebP, still and animated, to lossy frames at that libwebp quality. It is for photo-heavy animations
that pass the 5 MiB output limit as lossless WebP. The same quality gives the same bytes. The raster API and the CLI refuse a quality for
another format; the Action needs `webp` among its `formats` and leaves the other formats unchanged.

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

### The default frame rate

Without a frame rate, an animation is sampled at 30 frames a second (GIF 25), or, when that would pass `maxFrames`,
`maxTotalPixels` or `maxImagePixels`, at the highest whole rate below it that does not, and then lower again while the
encoded file passes `maxOutputBytes` (below). It never goes below the lowest rate that samples two frames (1 for a loop of over
a second or a timeline that plays once, 3 for a 500 ms loop): a lower one would turn the animation into a still image, so the
export fails instead. A 60 second loop cannot have 30 frames a second at any size: the 1000 frames allowed are 16
frames a second, and a 1680 x 800 pixel frame (a 840 x 400 design at scale 2) leaves room for 3 over 60 seconds. The
fit to the frame and pixel limits is arithmetic on the timeline, the size and the limits; the byte step depends on
the encoded bytes, which are the same in Node and in the browser. So the same input gives the same bytes in both, and a
design that exports at 30 (GIF 25) today exports the same file. `RasterOutput.frameRate` is the rate sampled (0 for a
still image) and `frameRateFitted` says it is lower than the default. The CLI prints one line on standard error and the
Action one info line when it was:
`design.json: apng of the 60000 ms animation sampled at 16 fps to fit the raster limits`.

A frame rate given on purpose is never changed: it either passes or fails before the first frame is drawn, naming the
highest rate that fits (`lower the frame rate to 16 or less`). An explicit rate that samples only one frame (1 or 2
frames a second on a 500 ms loop) does not fail: that frame is written as a still image, a PNG for an apng request. The size of the file is only known when it is encoded,
so the fit does not account for `maxOutputBytes`. When a default-rate animation passes it, the export is encoded
again at a lower rate, projected from the bytes written so far (the first frame costs the same at any rate, every later
one the average of those written, and a lower rate counts all its frames with no merge as a saving, 30 percent short of
the limit, and only rates that sample two frames or more): up to three times at the projected rate, then at the lowest
rate that animates (1 fps for a long loop). The first file that fits is the result, with `frameRate` and
`frameRateFitted` saying so; the same design, data and options always take the same steps and give the same bytes, as
an export at that rate given explicitly. If even the lowest rate is over the limit, the `raster-output-too-large` error
is the result and says so (`more than the 5242880 allowed even at 1 fps, the lowest frame rate that still animates;
lower the scale, or export SVG`). An explicit rate is not retried: its `raster-output-too-large` error names the
projected rate (`about 6 fps fits at this size`), an estimate that a design whose frames differ more at a lower rate
can miss. When even the first frame leaves no room, the error names no rate: export SVG, or lower the scale. Each
retry draws the frames again, so a long animation that needs them takes a multiple of the time of one export.

APNG frames after the first hold only the rectangle that changed (dispose none, blend source); WebP frames likewise,
with the rectangle's corner on even pixels as WebP requires (no blending, no disposal). GIF frames are full frames
that dispose to the background, so a transparent pixel never shows the frame before it.

## Limits

Every limit that can be known before drawing is checked before the first frame is drawn; the output size is checked
while encoding and stops at the frame that passes it. A failure is a `RasterError` and nothing is returned: the CLI
writes no file (an existing `--out` stays as it was), the Action writes nothing at all. The message names the measured
value, the limit and a fix.

| code                           | limit (`RasterLimits`)                                    | default                                     | fix                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raster-too-large`             | `maxSide`: pixels per side                                | 4096                                        | lower the scale (for example to 1)                                                                                                                       |
| `raster-too-many-frames`       | `maxFrames`: sampled frames                               | 1000                                        | lower the frame rate (the message names the highest rate that fits), else shorten the animation                                                          |
| `raster-too-long`              | `maxDuration`: ms of the timeline                         | 60000                                       | shorten the animation                                                                                                                                    |
| `raster-too-many-pixels`       | `maxTotalPixels`: all frames                              | 268435456                                   | lower the frame rate (named) or the scale                                                                                                                |
| `raster-too-many-image-pixels` | `maxImagePixels`: image pixels decoded (below)            | 268435456                                   | draw large images fewer times or smaller, or lower the frame rate (named)                                                                                |
| `raster-output-too-large`      | `maxOutputBytes`: encoded file                            | 5242880 (5 MiB, GitHub's image proxy limit) | lower the scale or the frame rate (about N fps fits, named; at the lowest rate that animates, the scale only), or export SVG (WebP: or give a `quality`) |
| `raster-font`                  | text needs a TTF, OTF or WOFF font carrying its family    |                                             | give the font asset as TTF, OTF or WOFF                                                                                                                  |
| `raster-image`                 | an image or SVG resvg or libwebp cannot read or draw      |                                             | fix or replace the image; move layers far outside the canvas onto it                                                                                     |
| `raster-options`               | a format, scale, frame rate, quality or time out of range |                                             |                                                                                                                                                          |

The fixes are worded for the CLI options (`--scale`, `--frame-rate`, `--quality`) and the Action inputs (`scale`, `frame-rate`, `quality`)
alike.

resvg decodes an image every time it draws it, in every frame. The renderer writes an image used by several layers (or a
`repeat`) once and draws it with `<use>`, so a small SVG can ask for thousands of decodes. Before the first frame is
drawn, raster export adds up each image's size from its header (PNG, JPEG, GIF, WebP) times the times it is drawn per
frame (every `<use>` that reaches it) times the frames, plus one decode of each distinct WebP image for its swap to PNG
(below), and refuses the export when that passes `maxImagePixels`.

`maxSide` matches the largest canvas side of the design format, so only a scale above 1 can pass it.

resvg 2.6.2 stops drawing (a WebAssembly trap in resvg-wasm) on a layer of its own (an opacity, a clip, a `<symbol>`)
that lies beyond twice the canvas. The renderer leaves out such layers when they lie wholly off the canvas
([renderer.md](renderer.md#layers)), in every frame, but a few such layers are still written: a stroke whose joins are
padded by twice its width (at an arc, a nearly straight curve or a short segment), a path whose control points or arc
box reach the canvas while its curve lies far, and text in a font whose `head` box overstates its glyphs. Such a design,
or an SVG from elsewhere given as `RasterInput.frame`, fails the export with `raster-image` (move the layer onto the
canvas or remove it), and the next export in the same process draws as before. Each failure leaks the object resvg-wasm
was drawing with, and after some 1,500 failures in one process resvg-wasm stops drawing altogether. The CLI and the
Action stop at the first failure; a long-running host calling `exportRaster` should restart the process (or load the
module in a new worker) after many.

## Fonts

resvg loads no system font. It draws text with the fonts the SVG embeds, read only from the `@font-face` rules of its
`<style>` (as the renderer writes them; a data-bound text holding `url(data:font/...)` is text and is never read as a
font), plus any a caller of `exportRaster` passes; the CLI and the Action pass none, so a font the renderer refused to
embed (restricted by its licence, or with a Reserved Font Name) is never drawn: the renderer draws such text as paths,
which resvg draws like any path. The renderer embeds WOFF subsets of the glyphs it draws. TTF and OTF are drawn as they are; WOFF 1.0 is decoded
first by `@readmint/fonts` (its header and table directory checked against the file, no table stored larger than it
is, all tables together at most the renderer's `maxFontBytes` before anything inflates, each table inflating to
exactly its declared size). WOFF2 (which only reaches raster export in an SVG the renderer did not write, or in a font
a caller passes), a broken font, or text with no font at all is `raster-font`: raster export never writes blank text.

resvg matches a text's `font-family` against the family name inside the font file (name 16, else 1), while the
renderer writes the asset's `family` (the `font-family-mismatch` warning of [renderer.md](renderer.md) when they
differ). Among the fonts of one name it picks by the width inside the font (OS/2 usWidthClass) before the weight, and
by the weight inside the font (usWeightClass) rather than the rule's: two faces of one family at different widths
(Horizon's ExtraCondensed and SemiCondensed Noto Sans) or a face whose own weight is not its rule's would draw with
the wrong face. In its own copy of the SVG, raster export picks for each `<text>`, and each `<tspan>` that sets a
family, weight or style of its own, the `@font-face` rule a browser takes (family, then style, then weight in CSS
order; a tspan inherits what it does not set) and names the face that rule embeds by what is inside it: its family,
`font-stretch`, `font-weight` and `font-style`. Such a text draws as in a browser; a text or tspan whose family no
font carries is `raster-font`.

## WebP images

resvg 0.x (as in resvg-js and resvg-wasm 2.6.2) cannot decode WebP. Raster export decodes each WebP image of the SVG
with libwebp and swaps it for a PNG of the same pixels, in its own copy of the SVG; an animated WebP becomes its first
frame on a transparent canvas, as a still SVG viewer shows it. Only an `<image>` whose `href` is a WebP data URI is
swapped; the same text in a data-bound text stays text. The WebP structure is read with bounds checks before
anything is decoded (size, the renderer's `maxImageSide` and `maxAnimationFrames`); a malformed file is `raster-image`.
Every image's header is read again before drawing (`sniffImage`); the JPEG symbol check of all images of the export
together has one budget of 134217728 decoding steps (the renderer's per-render bound), crossing it is
`raster-too-many-image-pixels`. A JPEG whose bytes the render already checked in the same module instance comes from
the renderer's sniff cache, charged the steps its check took, so it is not checked again ([renderer.md](renderer.md),
Images).
GIF and APNG images draw their first frame, as resvg does.

## API

```ts
import { exportRaster, initRaster, RasterError, RasterLimits } from "@readmint/raster";

const output = await exportRaster(
  { frame: (time) => renderSvg(design, { time }).svg, animation: design.animation },
  { format: "webp", scale: 2, frameRate: 30, quality: 80 }, // quality: omit for lossless WebP
);
// output: { bytes, format, mimeType, width, height, displayWidth, displayHeight, frames, duration }
```

`frame(time)` returns the renderer's static SVG at `time` ms (or the design's SVG for `undefined`) and throws when it
cannot render. `RasterInput.fonts` adds TTF, OTF or WOFF fonts. `RasterOptions.limits` lowers (or, in tests, raises) a
limit. `format` in the output is `png` for an `apng` request of a still design. The same input gives the same bytes.

`initRaster(wasmDir?)` loads the rasterizer and compiles libwebp once (`exportRaster` calls it itself); a bundle that
ships the modules elsewhere passes their folder: the Action bundle keeps them in `dist/wasm/` (`RasterWasm` names the
files, `resolveRasterWasm()` finds them in `node_modules`). This entry (`@readmint/raster`) reads the modules from disk
and runs in Node.

### In the browser

```ts
import { exportRaster, initRaster } from "@readmint/raster/browser";

await initRaster({ resvg: resvgWasmBytes, webp: webpWasmBytes }); // the two RasterWasm files, as bytes
const output = await exportRaster(input, { format: "png" }); // the same input and options as above
```

The `@readmint/raster/browser` entry has no Node API: `initRaster(modules)` takes the bytes of the two WebAssembly
files (it never fetches them; the caller decides where they come from), and `exportRaster` does not load anything
itself: called before `initRaster` it throws `raster modules are not loaded; call initRaster first`. Both entries share
one core, so the same input gives the same bytes. libwebp compiles synchronously, so call both in a worker, not on the
page's main thread. A worker that serves one export and is then terminated also frees the WebAssembly memory and the
objects resvg-wasm leaks on a failed drawing (above). The editor does exactly that
([editor.md](editor.md#raster-export)).

Base64 in the SVG (image and font data URIs) is read strictly with the renderer's loop-based codec (any size the renderer accepts): standard alphabet, padded, nothing else. Malformed
base64 is a `raster-image` or `raster-font` error naming the part, never a silently shortened file.

The same bytes in Node and in Chromium are pinned: `packages/raster/test/browserParity.ts` holds the SHA-256 of a
PNG, a WebP and an animated WebP of three designs; a Node test (the browser entry fed with the modules from
`node_modules`) and a Chromium test (modules fetched from the dev server) must both match it.

## Dependencies and licences

| package                   | licence                                           | what for                                                                                                                                                     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@resvg/resvg-wasm` 2.6.2 | MPL-2.0 (Rust crates: MIT, Apache-2.0, BSD, Zlib) | the rasterizer: resvg compiled to WebAssembly (2.5 MB), bundleable where the native resvg-js is not                                                          |
| `wasm-webp` 0.1.0         | MIT (libwebp: BSD-3-Clause)                       | WebP encoding (lossless; lossy with `quality`) and decoding: libwebp 1.3.2 (built from 6c484cbf, which carries the CVE-2023-4863 fix) in WebAssembly, 0.5 MB |
| `gifenc` 1.0.3            | MIT                                               | GIF palettes (pnnquant) and LZW encoding, 10 kB of JavaScript                                                                                                |
| `fflate` 0.8.3            | MIT                                               | zlib compression of PNG and APNG, and WOFF inflation: plain JavaScript, so a PNG's bytes depend on its pixels alone, on every machine and Node version       |

wasm-webp never frees a decoded image and does not check a failed decode, so each export gets its own libwebp instance
(its memory goes with the export) and a decode that returns the instance's memory at address 0 counts as failed.

PNG and APNG are written by own code (chunks, filters, CRC) on fflate. The Action bundle carries each package's licence
text in its banner, plus the libwebp notice and patent grant for wasm-webp, and for resvg-wasm (which publishes no
licence file) the MPL-2.0 text and the list of Rust crates in its WebAssembly with their licences
(`packages/action/scripts/licences/`).

The editor app ships both WebAssembly files as separate assets and, in `licences/THIRD-PARTY.txt`, the licence texts of
every npm package it bundles (fflate, gifenc and yaml among them) with the notices above, made by the script that
makes the Action bundle's banner.
