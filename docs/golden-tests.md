# Golden-image and SVG snapshot tests

Everything that renders is covered by a golden suite from `@readmint/golden` (private package, a dev tool: no product
package may list it in `dependencies`; a test pins this).

## What a suite checks

For every fixture:

1. The render runs twice and must give the same bytes (otherwise: not deterministic).
2. The SVG, normalized, equals the committed snapshot `<fixture>.svg`.
3. The SVG rasterized with resvg (no system fonts) equals the committed `<fixture>.png` within the tolerance.
4. In headless Chromium the raw SVG must be byte-identical to the Node render, and the browser raster of that SVG must
   match the same PNG golden within the (looser) browser tolerance.

On a failure the actual files and a diff image are written to `test-results/golden/<package>/<suite>/` and named in
the failure message. CI uploads that folder as the `golden-results` artefact when a job fails.

## Layout

```
packages/<pkg>/test/<suite>.golden.ts                 suite: default export of defineGoldenSuite({...})
packages/<pkg>/test/<suite>.golden.test.ts            goldenTest(suite, import.meta.url)           (Node)
packages/<pkg>/test/<suite>.golden.browser.test.ts    goldenBrowserTest(suite)                     (Chromium)
packages/<pkg>/test/golden/<suite>/<fixture>.svg|png  committed goldens
```

The suite file must import the renderer through code that runs in the browser too (no `fs`, no `Buffer`).
Suite and fixture names match `^[a-z0-9][a-z0-9-]*$`. A suite is `{ name, render(input) => svg, fixtures:
[{ name, input, scale? }], fonts?, fontsFromSvg?, tolerance?, browserTolerance?, precision? }`; `scale` (1..4) zooms the PNG; a rendered PNG above 4096 x 4096 is a failure in every mode.

Imports: `@readmint/golden` (suite types, `defineGoldenSuite`), `@readmint/golden/node` (`goldenTest`, ...),
`@readmint/golden/browser` (`goldenBrowserTest`), `@readmint/golden/vitest`. The root `vitest.config.ts` aliases them to
the sources, so no build is needed before `pnpm test`.

## Text

resvg loads no system fonts, so a fixture with `<text>` needs `fonts: [paths to TTF/OTF files]` (or `fontsFromSvg`, below) in the suite;
without them the rasterizer throws "SVG has text but the suite supplies no fonts" instead of drawing nothing.
paths are used as given, so they are relative to the working directory of the test run (the repository root under
`pnpm test`); build absolute ones from `import.meta.dirname`. A missing file is an error naming the path. A font
committed to the repository must be redistributable and its licence file must sit beside it
(`packages/renderer/test/fonts/README.md` lists each file with its source and checksum).

resvg reads no WOFF or WOFF2 and ignores `@font-face`: it draws `<text>` from the files the suite lists, matched by the
family name inside them, while Chromium draws the embedded subset. Text positions are written per character, so both
place the same glyphs at the same points; a suite whose fixtures use WOFF or WOFF2 assets lists a TTF or OTF of the
same release (`renderer-fonts-formats`). Two files with the same family and weight in one suite make resvg's choice
ambiguous: keep them in separate suites. The `renderer-fonts` suites draw every fixture twice, with the embedded font
(`<name>-font`) and as paths (`<name>-paths`), and `renderer-fonts.cross` checks in Node and in Chromium that the two
look alike within the suite tolerance.

Shaped text writes ligatures, joining forms, marks and right-to-left glyphs as private-use characters that only the
embedded subsets map ([renderer.md](renderer.md#text)), so the original font files cannot draw them. A suite whose
fixtures have such text sets `fontsFromSvg: (svg) => fonts` instead of `fonts`: resvg then draws each rendered SVG with
the fonts that function takes from it (`packages/renderer/test/embeddedFonts.ts` decodes every `@font-face` WOFF data
URI), exactly what Chromium draws with. resvg-js 2.6.2 reads fonts only from files, so the rasterizer writes each
once to a temporary file named by its SHA-256. `renderer-shaping` (Latin ligatures, Arabic words, marks and lam-alef,
Devanagari, mixed Latin and Arabic, wrapped right-to-left lines; Noto Naskh Arabic and Noto Sans Devanagari, see the
fonts README) draws every fixture with the subsets and as paths; `renderer-shaping.cross` holds the two to zero
differing pixels in Node, and to its `browserTolerance` (2%: Chromium antialiases each overlapping glyph of joined
scripts on its own but a path as one shape) in Chromium.

resvg-js 2.6.2 does not decode WebP images: a WebP draws nothing in the Node PNG while Chromium draws it, so a fixture
with a WebP image fails the browser leg. Cover WebP with unit tests instead.

resvg-js 2.6.2 aborts the whole test process (a native panic, no exception) on a layer of its own (an opacity, a clip, a
`<symbol>`) lying beyond twice the canvas. The renderer leaves out such layers wholly off the canvas
([renderer.md](renderer.md#layers)), but a few such layers are still written: a stroke whose joins are padded by twice
its width (at an arc, a nearly straight curve or a short segment), a path whose control points or arc box reach the
canvas while its curve lies far, and text in a font whose `head` box overstates its glyphs. No fixture, renderer SVG or
hand-written, may hold such a layer; cover those cases with raster tests (resvg-wasm refuses with `raster-image`).
`renderer-layout/off-canvas-layers`, `renderer-layout/off-canvas-tight` (a turned group with a far child, text of size
300 and a stroke 100 wide just past the canvas) and `renderer-animation/off-canvas-slide-in-t*` pin that renderer SVG
with layers it leaves out draws.

## Raster export

The golden rasterizer stays resvg-js 2.6.2 (native, tests only). Raster export ([raster.md](raster.md)) draws with
`@resvg/resvg-wasm` 2.6.2, the same resvg core, and its suite (`packages/raster/test/raster.golden.test.ts`) checks
that: every frame of every PNG, WebP, APNG and GIF it writes is decoded and compared with `rasterizeSvg` of the
renderer's SVG at that frame's time, within `defaultNodeTolerance` (GIF: its 1-bit alpha applied to the reference,
threshold 0.15, 1 % of the pixels). The decoded frames, stacked into one image per fixture and format, are the
committed goldens in `packages/raster/test/golden/raster/` (`pnpm golden:update raster`). WebP images in a design
are compared with the same design holding the PNG twin, since resvg-js cannot draw them.

## Animated designs

The PNG goldens are static: a suite of an animated design pins frames, fixtures rendered with `time` (for example
`packages/renderer/test/renderer-animation.golden.ts`, frames named `<design>-t<ms>`), which resvg and Chromium draw like
any other SVG. The animated SVG itself (CSS animation, no `time`) is pinned by a file snapshot,
`toMatchFileSnapshot("golden/<suite>-svg/<design>.svg")` in a folder of its own, so the suite's orphan clean-up never
touches it; plain `pnpm test` writes a missing snapshot (not under `CI`), `vitest -u` updates a changed one. A browser
test plays the animated SVG in Chromium, pauses every animation at each frame time and compares the computed styles
with the attributes of the frame at that time.

## Normalized SVG

Ids are renamed `id0`, `id1`, ... by definition order (references in `url(#x)`, `href`, `aria-labelledby`/`aria-describedby`, SMIL `begin`/`end`
and `<style>` follow); numbers in attribute values are rounded to `precision` decimals (default 3, `-0` becomes `0`);
`data:` URIs (in attributes and in `<style>`, such as embedded fonts) become `data:<mime>;sha256=<digest>`; line ends become LF. Text nodes, `class`, `font-family` and
namespaces are left alone. Fixtures must not contain live data (names, counts from the real GitHub): use fixed values.

## Tolerance

|                   | threshold | maxDiffRatio | includeAA |
| ----------------- | --------- | ------------ | --------- |
| Node (default)    | 0.1       | 0            | false     |
| browser (default) | 0.2       | 0.01         | false     |

`threshold` is the pixelmatch colour distance, `maxDiffRatio` the share of differing pixels. Anti-aliased pixels are
ignored so goldens made on one OS hold on another. PNGs above 4096 x 4096 are rejected before decoding.

## Updating goldens

```
pnpm golden:update [filter]      # e.g. pnpm golden:update self
```

This is the only thing that writes goldens: it creates missing ones, overwrites those beyond the tolerance (a golden
within the tolerance stays byte-identical, so there is no churn) and removes orphan goldens of the suite. A plain
`pnpm test` never writes, even with `READMINT_GOLDEN_UPDATE` exported, and `golden:update` refuses to run when `CI` is
set. Look at the changed PNGs before committing them.

## Browser tests locally

Browser tests need Chromium: `pnpm exec playwright install --only-shell chromium` (once; CI adds `--with-deps`).

The browser goldens also run in CI on Linux Chromium. Reproduce that run with the command below. It mounts the
checkout read-only and works on a copy without `node_modules`, so the host checkout and its dependencies stay
untouched (installing into the mounted checkout would make pnpm purge the host `node_modules`). Add
`-v "$PWD/test-results:/w/test-results"` to keep the diff images.

```sh
docker run --rm -e CI=true -v "$PWD:/src:ro" mcr.microsoft.com/playwright:v1.64.0-noble sh -c "mkdir -p /w && tar -C /src --exclude=node_modules --exclude=test-results -cf - . | tar -C /w -xf - && cd /w && corepack enable && pnpm install --frozen-lockfile && pnpm exec vitest run --project browser"
```

## Portability of goldens

Goldens are rendered by resvg with system fonts turned off, so they do not depend on the machine's fonts, and
anti-aliased pixels are ignored by the comparison. They were generated on Windows and the whole suite also passes on Linux (`mcr.microsoft.com/playwright:v1.64.0-noble`, same lockfile). Chromium
rasterization differs slightly between platforms (gradient dithering, AA), which the browser tolerance absorbs.
