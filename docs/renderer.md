# SVG renderer

`@readmint/renderer` turns a validated [design](design-format.md) plus data into one self-contained SVG. The same code
runs in Node (CLI, Action) and in the browser (editor preview): same design, data and assets give byte-identical SVG.

## API

```ts
import { frameTimes, renderSvg, RenderLimits } from "@readmint/renderer";

const result = renderSvg(design, {
  data, // a plain JSON object the expressions read; its own top-level keys are the root names
  locale: "de", // optional: the locale of the number and date filters; overrides the design `locale`, default that, else "en"
  assets: { fonts: { inter: bytes }, images: { logo: bytes } }, // bytes for assets whose src is a path
  limits: { maxOutputBytes: 1_000_000 }, // optional overrides of RenderLimits
  time: 400, // optional: the static frame at 400 ms of the design's timeline (see Animation)
});

type RenderResult =
  | { ok: true; svg: string; report: RenderReport; warnings: RenderIssue[] }
  | { ok: false; issues: RenderIssue[] };
```

- `design` must have passed `parseDesign` / `validateDesign` (`@readmint/format`). The renderer re-checks every value a
  binding gives against the ranges of the format (`ValueRanges`, shared with the schema), not the structure.
- The render is pure and synchronous: it reads no file, no clock, no randomness and no host locale. Asset bytes are keyed
  by asset id; the caller resolves paths (and keeps them inside the design's folder). An asset given in
  `options.assets` wins over its `src`; a `data:` URI `src` is decoded by the renderer; a path without bytes is
  `missing-asset`.
- The render stops at the first issue, in document order. Issues and warnings carry a JSON Pointer into the design.
- `time` must be a number of milliseconds in [0, 86400000] (else `range` at `""`); a design without `animation` ignores
  it and renders the same bytes at any time.

### Expressions

Bindings, `if`, `repeat` and text placeholders are evaluated by `@readmint/expr` ([expressions.md](expressions.md)),
the one implementation the CLI, the Action and the editor all render with, so the preview equals the output. Its rules
apply unchanged:

- A bindable property that is exactly one placeholder keeps the value's type; it is then checked against the
  property's type and the format's range.
- `if` is false for `false`, `null`, `0`, `""` and `[]`, true for anything else (`evaluateCondition`).
- `repeat.each` must give an array; `null` (missing data) repeats nothing; more than 10000 items, or `as` / `index`
  that an expression could not read back or that are equal, fail the render (`expandRepeat`).
- A text content is written as text: `null` as nothing, numbers as `String(n)`, booleans as `true` / `false` (`toText`,
  also when the content is a single placeholder); an array or object has no text form and is a `type` issue.
- Names are looked up in the locals first, then in the own top-level keys of `data`: in a `repeat` the item under `as`
  (default `item`) and its position under `index` (default `index`); inside a component `props`, the definition's
  defaults overlaid by the instance's props (a prop given as a binding is evaluated in the instance's scope, then
  checked against the declared type).

Each design string is compiled once per render. All evaluations of a render draw from one expr step budget
(`maxExpressionSteps`, below); once it is spent the render fails with a `binding` issue of expr code `budget`. An
expression error ends the render with a `binding` issue whose message carries expr's message and code (for example
`"{{ w / 0 }}": ... (not-finite)`); expr never puts a value read from the data into a message.

## Layers

Drawn in document order, first at the back. Layer `id` and `name` are not emitted.

- **repeat** gives one copy per item of `each` (at most 10000 items per repeat); then, per copy, `visible: false` or a
  falsy `if` drops it. A dropped layer takes no slot in a stack or grid. The copies of every repeat of a render count
  toward `maxRepeatCopies` before any is dropped, so nested repeats that `if` empties still stop with `too-large` at
  the repeat that passes the limit.
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
- Characters XML does not allow (see Output) are removed from the filled-in content before it is measured and
  wrapped, so such a text lays out and renders byte-identical to the same text without them.
- `align` (`start`, `middle`, `end`) anchors each line at the start, centre or end of the box with `text-anchor`, so the
  drawer aligns what it actually draws.
- Every `<text>` carries `text-rendering="geometricPrecision"`: without it Chromium on Linux rounds hinted glyph
  advances to whole pixels and draws the text wider than the renderer measured it.

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
- **Family**: the SVG asks for the asset's `family`. Rasterizers (resvg in raster export, [raster.md](raster.md), and in the goldens) match fonts by
  the family name inside the file, so an asset whose `family` differs from it renders, but with the warning
  `font-family-mismatch`. Family names are written as CSS strings with `\ " ' < > ( ) @` and line breaks escaped;
  rasterizers compare names literally, so keep such characters out of family names.

## Images

- Accepted by magic bytes: PNG (APNG), JPEG, GIF, WebP. SVG and anything else is `asset-format`; a `data:` URI whose
  type differs from the sniffed one is `asset-format`. The bytes are re-encoded as a data URI of the sniffed type.
- Checked before anything is decoded: size, then dimensions from the header, then animation frames (GIF image
  descriptors, APNG `acTL`, WebP `ANMF`). `sniffImage(bytes, maxFrames)`, exported, is that check (format, size, frames, EXIF
  from the header alone); raster export sizes its image decoding budget with it.
- `fit`: `contain` (default) = `preserveAspectRatio="xMidYMid meet"`, `cover` = `xMidYMid slice`, `fill` = `none`.
  `alt` becomes `aria-label`.
- An image drawn once is an `<image>` holding its data URI. Image data drawn more than once (a `repeat`, several
  layers, or several assets with the same bytes) is written once: an `<image id="d<hash>-i<hash>">` at its own pixel size in
  `<defs>`, one `<symbol id="d<hash>-s<hash>">` per `fit` that shows it (its `viewBox` and `preserveAspectRatio` do what the
  inline image does, its viewport clips like `cover`), and per layer a `<use>` with the layer's `x y width height`,
  opacity and rotation. A `<use>` with an `alt` gets `role="img"` beside its `aria-label`, so it keeps the accessible
  name an `<image>` has. Animation classes and transform groups apply to the `<use>` as to an `<image>`. An image
  with EXIF data (JPEG APP1 `Exif`, PNG `eXIf`, WebP `EXIF`) is never shared and stays an inline `<image>` at every
  use, because browsers apply its orientation, which a symbol sized from the stored pixels would not follow.
- An animated GIF, APNG or WebP is inlined as is; browsers play it, rasterizers draw the first frame. The Node golden
  rasterizer (resvg-js 2.6.2) cannot decode WebP, so WebP has unit tests but no golden image. Raster export draws WebP
  all the same: it swaps each WebP for a PNG of the same pixels (the first frame of an animation) in its own copy of the
  SVG ([raster.md](raster.md#webp-images)); the SVG output never changes.

## Animation

A design with an `animation` timeline ([design-format.md](design-format.md#animation)) renders two ways from one list of
keyframes per track, so the browser and the frames cannot drift:

- **The animated SVG** (no `time`): CSS animation for browsers (GitHub shows SVG through `<img>`, where CSS animation
  plays and scripts never run). Every static attribute is the frame at time 0, so a viewer that ignores the CSS
  (resvg, an editor thumbnail, a reader asking for reduced motion) shows the first frame.
- **A frame** (`time: t`): the same elements with the attributes sampled at `t`, no class and no animation CSS: a
  static SVG for raster export ([raster.md](raster.md)) and the golden frames. A looping timeline draws `t mod duration`, one that does
  not loop draws `min(t, duration)` (it holds its end).

Each track is mapped onto the timeline: it holds its first value until it starts (`delay + stagger x index`), runs its
keyframes over its `duration`, and holds its last value to the end of the timeline; a track running past the end is cut
there (the warning `animation-cut`, once per track), the segment before the cut keeping its easing over the shorter
span. Keyframe positions are percentages of the timeline rounded to 3
decimals; keyframes landing on the same rounded position keep their order one step (0.001 %) apart. Values are rounded
as written (numbers to 3 decimals, colour channels to integers), and the frames sample these rounded keyframes with the
same curves CSS uses: `easing` from a keyframe to the next is written as that keyframe's `animation-timing-function`,
and the frames solve the cubic-bezier with a fixed number of bisection steps using `+ - * /` only. Opacity, colours and
paint opacities are clamped like CSS clamps them when an easing overshoots; transforms and the dash offset are not.

Output:

- Every animation of the render is known before anything is drawn, so the rules get a document prefix `r<hash>`:
  `r` and 7 base-36 digits of the 32-bit FNV-1a hash of the rule text. `<style>` holds `@keyframes r<hash>k0, k1, ...`
  (one per distinct track; tracks of one element with the same positions and easings share one) and classes
  `.r<hash>a0, a1, ...` (`animation: <keyframes> <duration>ms linear infinite`, or `linear both` when the timeline
  plays once), deduplicated by their text, so identical copies of a repeat share their rules. The root `<svg>` carries
  `class="r<hash>"`. An SVG inlined into a page (the editor) shares the page's style: the prefix keeps two different
  Readmint SVGs apart, while the same design still gives the same bytes. Only numbers, `#rrggbb` colours and fixed
  words are written there; nothing from the design or the data. One rule
  `@media (prefers-reduced-motion:reduce){.r<hash> [class]{animation:none!important}}` stops this document's
  animations, and nothing of the host page, for readers who ask for less motion. No SMIL, no script. A frame and a
  design without animation have no root class.
- `opacity`, `fill` and `stroke` are animated on the element itself (`fill` with `fill-opacity` when a keyframe colour
  has alpha). `draw` sets `stroke-dasharray="D D"` and animates `stroke-dashoffset` from `D` (nothing drawn) to 0 (all
  drawn), `D` being the length of the longest subpath times 1.01 plus 1, rounded up to 3 decimals. Engines start the
  dash pattern again at every subpath (each `M`, and the segment after a `Z`), so every subpath draws from its own start
  at the pace of the longest one, and shorter subpaths are complete earlier. The length is computed (lines exactly,
  curves as 32 chords each, `+ - * /` and `Math.sqrt` only), because resvg ignores `pathLength`. Paths with arcs cannot
  `draw` (their length needs trigonometry).
- `x`, `y`, `rotation` and `scale` each get a `<g>` of their own around the element, outermost first in that order,
  whose CSS animates only that group's `transform` (the element keeps its own `transform` for its static `rotation`).
  With a rotation or scale the groups sit in `<g transform="translate(cx cy)">` and the element is drawn moved by
  `-cx -cy`, so both turn around the centre of the laid-out box. Layout never sees the animation.
- resvg-js ignores `@keyframes`, `animation` and `@media`, which is why the static attributes carry frame 0.

`frameTimes(animation, frameRate)` gives the frame times of a timeline (`report.animation` or the design's
`animation`) at 1..60 frames per second: `i * 1000 / frameRate` below the duration, plus the duration itself when the
timeline does not loop (a looping timeline's end equals time 0). A duration outside 1..60000 or a rate outside 1..60
throws a `RangeError`.

## Output

`<svg xmlns width height viewBox role="img">` (an animated SVG adds `class="r<hash>"`, the prefix of its animation
names), then `<title>` / `<desc>` from the design's `title` / `description`, then
`<defs>` (the style with fonts and animation rules, then gradients, clip paths, shared images and their symbols), then
the canvas background and the layers.

- Every definition is written once however often it is used: identical gradients (fills, strokes, text fills, the
  canvas background), clip paths of one size and image data drawn more than once each share one element. Its id is a
  letter (`g` gradient, `c` clip path, `i` image, `s` image symbol) and a 7-character base-36 FNV-1a hash of its
  markup, whatever the order of use; two different definitions of one document whose hashes clash get `-1`, `-2`, ...
  in order of use. Every id is prefixed `d<hash>-`, the same hash function over the document before the prefix
  is written in, so two different Readmint SVGs inlined into one page get different ids (`d<hash>-g<hash>`), barring a
  32-bit hash clash. Two byte-identical documents share their ids, and the renderer cannot change that (the same input
  gives the same bytes): an embedder must not hide a copy with `display:none`, because in Chromium the visible copy's
  gradient and clip-path `url(#...)` references then resolve to the hidden copy's definitions and break. Hide a copy
  with `visibility`, off-screen placement or `opacity: 0`, or rewrite the ids per copy.

- No `<script>`, no event attributes, no `foreignObject`, no external reference: every `href` is a `data:image/...`
  URI or a `#fragment` of the same document, every `url()` a `#fragment` or (in the style) a `data:font/...` URI;
  every fragment names an id the document defines. Every string from the design or the data is XML-escaped, after
  removing the code points XML 1.0 does not allow: the C0 controls except tab, line feed and carriage return, lone
  surrogates, U+FFFE and U+FFFF (GitHub free texts such as a bio may hold them).
- Path data whitespace SVG does not know (vertical tab, form feed, no-break space, line separator, ...) is written as
  a space; the path keeps its meaning and its box.
- Numbers are rounded to 3 decimals (`-0` printed as `0`), computed only with exactly specified arithmetic (no
  trigonometry: rotation is a `rotate()` transform for the drawer), so Node and browsers print the same digits.

## Limits

`RenderLimits` (override per call with `limits`):

| limit                   | default | why                                                                                                                  | issue                |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `maxOutputBytes`        | 5242880 | GitHub's camo proxy refuses larger images                                                                            | `too-large`          |
| `maxImageBytes`         | 4194304 | one image, decoded size, checked before decoding                                                                     | `asset-too-large`    |
| `maxFontBytes`          | 4194304 | one font, decoded size, checked before decoding                                                                      | `asset-too-large`    |
| `maxImageSide`          | 8192    | pixels per side; keeps the raster path within memory                                                                 | `asset-too-large`    |
| `maxAnimationFrames`    | 1000    | frames of an animated image                                                                                          | `asset-too-large`    |
| `maxTextLength`         | 10000   | characters of a text after its placeholders are filled                                                               | `too-large`          |
| `maxExpressionSteps`    | 5000000 | expression work of the whole render (under a second of the costliest string filters), including copies an `if` drops | `binding` (`budget`) |
| `maxRepeatCopies`       | 100000  | copies made by every `repeat` of the render together, including copies an `if` or `visible: false` drops             | `too-large`          |
| `maxAnimationKeyframes` | 100000  | keyframes of every animation track of the render together, every repeat copy counted, in a frame too                 | `too-large`          |

The output size is counted while the SVG is written (a shared definition once, when its first use writes it), and
every layer reserves the least markup of its kind before it is built (a path also its data, a text its filled-in
content, before either is measured), so a huge or nested `repeat` stops early instead of building everything.
Animation CSS counts toward `maxOutputBytes` like any markup, and every animated transform reserves its group (a
`draw` its dash attributes) before the layer is built. Opacity and colour tracks write nothing of their own and the CSS
is written only once every track is built, so `maxAnimationKeyframes` bounds that work: each track charges its
keyframes before any is resolved. Fixed limits: 10000 items per `repeat` (expr, `binding` at
`repeat/each`) and 64 levels of nested component instances (`too-large`).

## Issues

| code                   | meaning                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `binding`              | an expression failed to compile or evaluate, the step budget ran out, a repeat `each` is not a list or has more than 10000 items, or its `as`/`index` names are unreadable or equal (the message names expr's error code)                           |
| `type`                 | a value of the wrong kind (also a prop of the wrong type, a list or object written into text)                                                                                                                                                       |
| `range`                | a number outside the format's range, a keyframe offset below the one before it, a `time` outside [0, 86400000]                                                                                                                                      |
| `missing-asset`        | an asset path without supplied bytes, or a reference to no asset                                                                                                                                                                                    |
| `asset-format`         | not an accepted image or a malformed font; a data URI type that does not match                                                                                                                                                                      |
| `asset-too-large`      | over a byte, side or frame limit                                                                                                                                                                                                                    |
| `unsupported-font`     | WOFF, WOFF2 or a font collection                                                                                                                                                                                                                    |
| `font-not-embeddable`  | the licence or the fsType forbids embedding                                                                                                                                                                                                         |
| `too-large`            | the SVG passes `maxOutputBytes`, a text passes `maxTextLength`, the repeats pass `maxRepeatCopies` (at the `repeat` that crossed it), the tracks pass `maxAnimationKeyframes` (at the track that crossed it), components nest deeper than 64 levels |
| `font-family-mismatch` | warning: the asset family differs from the family inside the font                                                                                                                                                                                   |
| `animation-cut`        | warning: a track runs past the end of the timeline and is cut there (once per track, however many copies)                                                                                                                                           |

## Report

A successful render reports `bytes` (UTF-8 size of the SVG), `limit` (the `maxOutputBytes` used) and, in first-use
order, `fonts` and `images` as `{ asset, bytes }`: the bytes each asset adds to the SVG. The data of an image counts
once however often it is drawn (an image with EXIF data, inline at every use, once per use), and 0 for an asset whose
bytes an earlier asset already wrote, so the image bytes add up to what the SVG holds. A design with a timeline also reports `animation: { duration, loop }`, what `frameTimes`
takes.
