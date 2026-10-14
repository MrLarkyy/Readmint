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
[{ name, input, scale? }], tolerance?, browserTolerance?, precision? }`; `scale` (1..4) zooms the PNG; a rendered PNG above 4096 x 4096 is a failure in every mode.

Imports: `@readmint/golden` (suite types, `defineGoldenSuite`), `@readmint/golden/node` (`goldenTest`, ...),
`@readmint/golden/browser` (`goldenBrowserTest`), `@readmint/golden/vitest`. The root `vitest.config.ts` aliases them to
the sources, so no build is needed before `pnpm test`.

## Text

resvg loads no system fonts, so a fixture with `<text>` needs `fonts: [paths to TTF/OTF files]` in the suite;
without them the rasterizer throws "SVG has text but the suite supplies no fonts" instead of drawing nothing. Use
paths are used as given, so they are relative to the working directory of the test run (the repository root under
`pnpm test`); build absolute ones from `import.meta.dirname`. A missing file is an error naming the path. A font
committed to the repository must be redistributable and its licence file must sit beside it.

## Normalized SVG

Ids are renamed `id0`, `id1`, ... by definition order (references in `url(#x)`, `href`, `aria-labelledby`/`aria-describedby`, SMIL `begin`/`end`
and `<style>` follow); numbers in attribute values are rounded to `precision` decimals (default 3, `-0` becomes `0`);
`data:` URIs become `data:<mime>;sha256=<digest>`; line ends become LF. Text nodes, `class`, `font-family` and
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

## Portability of goldens

Goldens are rendered by resvg with system fonts turned off, so they do not depend on the machine's fonts, and
anti-aliased pixels are ignored by the comparison. They were generated on Windows and the whole suite also passes on Linux (`mcr.microsoft.com/playwright:v1.64.0-noble`, same lockfile). Chromium
rasterization differs slightly between platforms (gradient dithering, AA), which the browser tolerance absorbs.
