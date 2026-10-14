# SVG renderer

`@readmint/renderer` turns a validated [design](design-format.md) plus data into one self-contained SVG. The same code
runs in Node (CLI, Action) and in the browser (editor preview): same design, data and assets give byte-identical SVG.

## API

```ts
import { renderSvg, RenderLimits } from "@readmint/renderer";

const result = renderSvg(design, {
  data, // what bindings read; its own keys are the root scope
  assets: { fonts: { inter: bytes }, images: { logo: bytes } }, // bytes for assets whose src is a path
  expressions, // ExpressionEvaluator, needed as soon as the design holds a binding or a {{ in a text
  limits: { maxOutputBytes: 1_000_000 }, // optional overrides of RenderLimits
});

type RenderResult =
  | { ok: true; svg: string; report: RenderReport; warnings: RenderIssue[] }
  | { ok: false; issues: RenderIssue[] };
```

- `design` must have passed `parseDesign` / `validateDesign` (`@readmint/format`). The renderer re-checks every value a
  binding gives against the ranges of the format (`ValueRanges`, shared with the schema), not the structure.
- The render is pure and synchronous: it reads no file, no clock, no randomness and no locale. Asset bytes are keyed
  by asset id; the caller resolves paths (and keeps them inside the design's folder). An asset given in
  `options.assets` wins over its `src`; a `data:` URI `src` is decoded by the renderer; a path without bytes is
  `missing-asset`.
- The render stops at the first issue, in document order. Issues and warnings carry a JSON Pointer into the design.

### Expressions

The renderer does not parse expressions. The caller passes an `ExpressionEvaluator`:

```ts
interface ExpressionEvaluator {
  evaluate(binding: `{{${string}}}`, scope: RenderScope): unknown; // a bindable property
  interpolate(template: string, scope: RenderScope): string; // a text content with placeholders
}
```

The CLI, the Action and the editor pass the same implementation (`@readmint/expr`), so the preview equals the output.
The scope is a null-prototype object: the own keys of `data`, plus

- in a `repeat`: the item under `as` (default `item`) and its position under `index` (default `index`);
- inside a component: `props`, the definition's defaults overlaid by the instance's props (a prop given as a binding is
  evaluated in the instance's scope, then checked against the declared type).

Locals win over data keys. A thrown evaluator error becomes a `binding` issue carrying at most 200 characters of its
message; keeping secrets out of messages is the evaluator's job.

## Layers

Drawn in document order, first at the back. Layer `id` and `name` are not emitted.

- **repeat** gives one copy per item of `each` (which must evaluate to a list); then, per copy, `visible: false` or an
  `if` that evaluates to a falsy value drops it. A dropped layer takes no slot in a stack or grid.
- **Position**: every layer has a box from its `x`/`y` (default 0) of its width and height. A `rect`, `ellipse` and
  `image` box is its `width` by `height`; a `path` box runs from its origin to the furthest point of its data (control
  points and a bound around arcs included, never smaller than the drawn path); a `text` box is described below; a
  `group` box is its `width`/`height` when set, else its content extent (the furthest right and bottom edge of its
  children, at least 0); a `component` box is the instance `width`/`height`, else the definition's, else the content
  extent. The box is for layout only: instance sizes do not scale the content.
- **Group layout**: `absolute` (default) keeps the children's `x`/`y`. `stack` places children one after another along
  `direction` with `gap`; across, `align` puts each child at the start, centre or end of the group's cross size (its
  explicit `height` for a row, `width` for a column, else the largest child). `grid` fills `columns` cells per row; the
  cell width is the group's explicit width split evenly between the columns minus the gaps, else the widest child; each
  row is as tall as its tallest child. In a stack or grid a child's own `x`/`y` is an offset inside its slot.
- **rotation** turns a layer around the centre of its box and does not change the layout. **opacity** applies to the
  layer and everything in it. **clip** on a group clips to the group box.
- **style**: a layer's own property wins over the one of its `style`.
- **Paint**: colours are written as `#rrggbb` plus `fill-opacity` / `stroke-opacity` / `stop-opacity` for alpha (the
  widest supported form). Gradient coordinates are fractions of the painted element's bounding box (defaults: linear
  `x1 0 y1 0 x2 1 y2 0`, radial `cx 0.5 cy 0.5 r 0.5`). A shape or text without `fill` uses the SVG default (black);
  without `stroke` it has none.

## Text

- Metrics come from the font file (TrueType/OpenType tables `head`, `hhea`, `hmtx`, `OS/2`, `cmap`), never from the
  system, so Node and every browser measure alike. The advance of a code point is its glyph advance scaled to
  `fontSize` (default 16) plus `letterSpacing` (default 0); v0 applies no kerning (RM-14). A code point the font lacks is
  measured as glyph 0.
- A line break in the content is a hard break. With a `width`, words (split at spaces) fill each line greedily; a word
  wider than the line breaks between code points. The space at a soft break is dropped, every other space is kept
  (`xml:space="preserve"`).
- The box is the `width` (or the widest line) by `lines x lineHeight x fontSize` (`lineHeight` default 1.2). The
  first baseline sits half the leading plus the ascender below the box top (the ascender and descender of `hhea`, or of
  `OS/2` when the font sets USE_TYPO_METRICS).
- `align` (`start`, `middle`, `end`) anchors each line at the start, centre or end of the box with `text-anchor`, so the
  drawer aligns what it actually draws.

## Fonts

- v0 embeds TrueType (`.ttf`) and OpenType (`.otf`) files whole, as `@font-face` data URIs in a `<style>` element.
  WOFF, WOFF2 and font collections fail with `unsupported-font` until subsetting arrives (RM-14).
- **Licence**: a font is embedded only when its asset declares `licence.embedding: "allowed"` and its OS/2 `fsType`
  permits embedding (neither the restricted-licence bit `0x0002` nor the bitmap-only bit `0x0200`; the stricter reading
  wins). Otherwise the render fails with `font-not-embeddable` naming the asset; drawing such text as paths arrives with
  RM-14. Fonts no text uses are never loaded or embedded.
- **Weight**: a text's `font` names an asset; with a `fontWeight`, the renderer picks among the assets of the same
  `family` and `style` by CSS font matching (declared `weight`, default 400; equal weights prefer the named asset, then
  the smallest asset id) and writes that asset's weight. Bold is never synthesized.
- **Style**: the text is drawn in the style of the asset its `font` names; an `italic` asset gets
  `font-style="italic"` on the text and `font-style:italic` in its `@font-face` rule, so a regular and an italic asset
  of one family each draw with their own face.
- **Family**: the SVG asks for the asset's `family`. Rasterizers (resvg in the Action and the goldens) match fonts by
  the family name inside the file, so an asset whose `family` differs from it renders, but with the warning
  `font-family-mismatch`. Family names are written as CSS strings with `\ " ' < > ( ) @` and line breaks escaped;
  rasterizers compare names literally, so keep such characters out of family names.

## Images

- Accepted by magic bytes: PNG (APNG), JPEG, GIF, WebP. SVG and anything else is `asset-format`; a `data:` URI whose
  type differs from the sniffed one is `asset-format`. The bytes are re-encoded as a data URI of the sniffed type.
- Checked before anything is decoded: size, then dimensions from the header, then animation frames (GIF image
  descriptors, APNG `acTL`, WebP `ANMF`).
- `fit`: `contain` (default) = `preserveAspectRatio="xMidYMid meet"`, `cover` = `xMidYMid slice`, `fill` = `none`.
  `alt` becomes `aria-label`.
- An animated GIF, APNG or WebP is inlined as is; browsers play it, rasterizers draw the first frame. The Node golden
  rasterizer (resvg-js 2.6.2) cannot decode WebP, so WebP has unit tests but no golden image.

## Output

`<svg xmlns width height viewBox role="img">`, then `<title>` / `<desc>` from the design's `title` / `description`, then
`<defs>` (the font style, gradients `g0, g1, ...`, clip paths `c0, c1, ...`, ids allocated per render in creation
order), then the canvas background and the layers.

- No `<script>`, no event attributes, no `foreignObject`, no external reference: every `href` is a `data:image/...`
  URI, every `url()` a `#fragment` or (in the style) a `data:font/...` URI. Every string from the design or the data
  is XML-escaped.
- Numbers are rounded to 3 decimals (`-0` printed as `0`), computed only with exactly specified arithmetic (no
  trigonometry: rotation is a `rotate()` transform for the drawer), so Node and browsers print the same digits.

## Limits

`RenderLimits` (override per call with `limits`):

| limit                | default | why                                                    | issue             |
| -------------------- | ------- | ------------------------------------------------------ | ----------------- |
| `maxOutputBytes`     | 5242880 | GitHub's camo proxy refuses larger images              | `too-large`       |
| `maxImageBytes`      | 4194304 | one image, decoded size, checked before decoding       | `asset-too-large` |
| `maxFontBytes`       | 4194304 | one font, decoded size, checked before decoding        | `asset-too-large` |
| `maxImageSide`       | 8192    | pixels per side; keeps the raster path within memory   | `asset-too-large` |
| `maxAnimationFrames` | 1000    | frames of an animated image                            | `asset-too-large` |
| `maxTextLength`      | 10000   | characters of a text after its placeholders are filled | `too-large`       |

The output size is counted while the SVG is written, and every layer reserves the least markup of its kind before it
is built (a path also its data, a text its filled-in content, before either is measured), so a huge or nested `repeat`
stops early instead of building everything. A bound on the number of repeat copies and
stripping of characters XML does not allow arrive with RM-25.

## Issues

| code                   | meaning                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `binding`              | the evaluator threw for a binding or a text                                                           |
| `no-evaluator`         | the design holds a binding or a `{{` in a text but no evaluator was given                             |
| `type`                 | a value of the wrong kind (also a repeat `each` that is not a list, a bad prop)                       |
| `range`                | a number outside the format's range                                                                   |
| `missing-asset`        | an asset path without supplied bytes, or a reference to no asset                                      |
| `asset-format`         | not an accepted image or a malformed font; a data URI type that does not match                        |
| `asset-too-large`      | over a byte, side or frame limit                                                                      |
| `unsupported-font`     | WOFF, WOFF2 or a font collection                                                                      |
| `font-not-embeddable`  | the licence or the fsType forbids embedding                                                           |
| `too-large`            | the SVG passes `maxOutputBytes`, a text passes `maxTextLength`, components nest deeper than 64 levels |
| `font-family-mismatch` | warning: the asset family differs from the family inside the font                                     |

## Report

A successful render reports `bytes` (UTF-8 size of the SVG), `limit` (the `maxOutputBytes` used) and, in first-use
order, `fonts` and `images` as `{ asset, bytes }`: the bytes each asset adds to the SVG (an image used twice counts
twice).
