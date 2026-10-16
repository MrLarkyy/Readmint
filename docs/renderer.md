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
  layerBoxes: true, // optional: also return where each drawn layer sits (see Report); the SVG stays the same
});

type RenderResult =
  | {
      ok: true;
      svg: string;
      report: RenderReport;
      warnings: RenderIssue[];
      layerBoxes?: LayerBox[];
    }
  | { ok: false; issues: RenderIssue[] };
```

- `design` must have passed `parseDesign` / `validateDesign` (`@readmint/format`). The renderer re-checks every value a
  binding gives against the ranges of the format (`ValueRanges`, shared with the schema), not the structure.
- The render is pure and synchronous: it reads no file, no clock, no randomness and no host locale. Asset bytes are keyed
  by asset id; the caller resolves paths (and keeps them inside the design's folder). An asset given in
  `options.assets` wins over its `src`; a `data:` URI `src` is decoded by the renderer; a path, or an image `src` bound
  to data (`{{binding}}`, fetched by the CLI with `--fetch-images` and by the Action), without bytes is `missing-asset`.
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
  checked against the declared type, an `enum` prop against its `values`, an `array` prop for being an array; a
  mismatch is a `type` issue at the instance prop). A repeat in the component can iterate an array prop. Defaults and literal list items are used as written, never
  evaluated.

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
- **Layers off the canvas**: a layer drawn as a layer of its own (one with `opacity`, a group with `clip`, an image
  drawn through a shared `<use>`) whose drawing lies wholly outside the canvas is not written: it draws nothing in any
  viewer, and resvg 2.6.2 aborts (resvg-js: the whole process) on such a layer once it lies beyond twice the canvas. Its
  gradients and clip path are not written either; its fonts are embedded as for any text, and `layerBoxes` still lists
  it so the editor can select it. A clip group on the canvas whose children all lie outside the canvas counts as
  outside. The box tested is never trimmed: text by its glyphs, not its layout box, each within the `head` box of the
  font its run draws with (a font whose `head` box is empty: 1 em left of the pen to 2 em right, 2 em above the
  baseline to 1 em below); the `head` box is trusted, so text in a font whose `head` box is smaller than its glyphs
  can be left out while it shows. A path stroke is bounded by the hull of its points grown by half the width plus the
  miter tip of each join (miter limit 4). A join next to an arc (`A`), a nearly straight curve or a short segment,
  and the far end of the segment after one, is padded by twice the width instead: rasterizers may draw those
  directions otherwise or skip the segment when a group scales the path down, so the box holds at any scale. A
  segment is short below 1/64 + 1/1024 of the stroke width + 1/1000 of its control polygon's length + 1/100 of its
  largest coordinate (near coordinate 400, any segment under about 4 units). A turn is bounded by intervals for its
  cosine and sine from fixed polynomials. All of it is computed with `+ - * / %`, `round`, `min`, `max`, `abs` and a
  square root (each exactly rounded per IEEE 754) only, so Node and every browser decide alike. A few far layers that
  draw nothing are still kept: a stroke whose joins are padded by twice its width (a stroke 100 wide 300 right of a
  100 wide canvas is left out as a square but kept as a rounded square with `A` corners), a path whose control
  points or arc box reach the canvas while its curve lies far, and text in a font whose `head` box overstates its
  glyphs. Such a layer is written, browsers draw the SVG as usual, and raster export of it beyond twice the canvas
  refuses with `raster-image` ([raster.md](raster.md)). Layers without an own layer stay wherever they are; resvg
  draws them anywhere.
- **Path data template**: a `d` with `{{...}}` placeholders is evaluated per copy like a text, then checked as the
  format checks a literal `d` (not empty, at most 100000 characters, path data characters only; else `range` at `d`).
  Each copy gets the box and the `draw` length of its own data; a literal `d` is measured once per layer.
- **style**: a layer's own property wins over the one of its `style`.
- **Paint**: colours are written as `#rrggbb` plus `fill-opacity` / `stroke-opacity` / `stop-opacity` for alpha (the
  widest supported form). Gradient coordinates are fractions of the painted element's bounding box (defaults: linear
  `x1 0 y1 0 x2 1 y2 0`, radial `cx 0.5 cy 0.5 r 0.5`). A shape or text without `fill` uses the SVG default (black);
  without `stroke` it has none.

## Text

- Metrics come from the font file (TrueType/OpenType tables `head`, `hhea`, `hmtx`, `OS/2`, `cmap`), never from the
  system, so Node and every browser measure alike.
- **Every glyph is placed by the renderer**, which shapes text itself (`shapeText` of `@readmint/fonts`, the same
  TypeScript in Node and browsers, no WebAssembly):
  - **Clusters and fallback**: the text is split into character clusters (a base with its marks, joiners, variation
    selectors and other default ignorables; a Devanagari conjunct; the conjoining jamo of a Hangul syllable; letters
    that compose canonically, such as Kirat Rai vowel signs; an emoji ZWJ sequence). A cluster takes the first of the
    text's font and its `fallback` fonts that has all of it as normalized for that font (below: a font with `e` and
    U+0301 has U+00E9, one with only U+AC01 has its conjoining jamo). When none has all of it, its base takes the first
    font that has the base, and a mark, joiner or variation selector stays in its base's font when that font has it
    and takes its own fallback otherwise (and then cannot attach to the base).
  - **Normalization**: before its characters become glyphs, each cluster is normalized against the font's `cmap`, as
    HarfBuzz does: fully decomposed by the canonical decompositions of Unicode 16.0.0 (a singleton such as U+212B
    ANGSTROM SIGN or a CJK compatibility ideograph is kept when the font has it), its marks stably sorted by combining
    class (in HarfBuzz's modified order: Arabic shadda before the vowel marks, Hebrew points in SBL order; a run of
    more than 32 marks stays as written); in a cluster of Arabic script (its first letter that is not Common or
    Inherited; a cluster without one, such as marks on a tatweel U+0640 or a dotted circle, takes its run's), the modifier combining marks of UAX #53 (U+0654, U+0655, U+0658, U+06DC, U+06E3, U+06E7, U+06E8,
    U+08CA-U+08CB, U+08CD-U+08CF, U+08D3, U+08F3) that lead the marks of their class (220, then 230) then move to the
    start of the run, as HarfBuzz does, so they stack nearest the base, before the vowel marks; a modifier behind
    another mark of its class keeps its place (U+0627 U+0653 U+0654 keeps hamza on top of maddah: U+0622 U+0654).
    Then the cluster is recomposed by Unicode canonical composition (composition exclusions and blocking honoured; a
    moved mark keeps its class and blocks every later mark of its class or lower, so U+0627 U+0654 U+0653 and
    U+0627 U+064E U+0654 U+0653 in a font without U+0623 keep their maddah apart from the alef): when the font has every character of the fully composed cluster (its NFC), that is drawn, so
    a precomposed character the font has is kept even without the composites on the way to it (U+1EC7 without
    U+1EB9, U+AC01 without U+AC00); otherwise a pair composes only into a character the font has. So `e` U+0301, U+00E9 and any other canonically equivalent
    spelling (marks in either order) draw the same glyphs and give the same SVG bytes in a font with either form; the
    tables are the package's own, never `String.prototype.normalize` or `Intl`. Compatibility forms (NFKC) are not
    folded, except the space and hyphen fallbacks below.
  - **Space and hyphen fallbacks**: a character the font's `cmap` lacks is still drawn by that font, as HarfBuzz
    does, when it has U+0020 (spaces) or a hyphen: U+00A0, U+2000-U+200A, U+202F, U+205F and U+3000 take the U+0020
    glyph with the advance HarfBuzz gives them (in font units, integers: U+2000 and U+2002 1/2 em, U+2001, U+2003 and
    U+3000 1 em, U+2004 1/3, U+2005 1/4, U+2006 1/6, U+2009 1/5, U+200A 1/16, each rounded to the nearest unit, U+205F
    4/18 em; U+2007 the advance of the first digit the font has, U+2008 that of `.` else `,`, both else the space
    advance; U+202F half the space advance; U+00A0 the advance of the glyph drawn, normally the space advance; those "space advance" rules use the glyph GSUB left in place of the space, and a glyph formed by a ligature keeps the ligature's advance), and U+2011 takes the U+2010 glyph, else the
    U+002D glyph, with that glyph's advance. The font's kerning applies on top. The text's own font draws them before
    any `fallback` font and no `missing-glyph` is reported; a font without U+0020 does not get the space variants (as
    before). Font-mode SVG writes such a glyph as a private-use character and keeps the real text in `aria-label`.
  - **Bidi**: each hard line is a paragraph of the Unicode Bidirectional Algorithm (UAX #9, Unicode 16.0.0): its
    direction comes from its first strong character, explicit embeddings, overrides and isolates and paired brackets
    are honoured, mirrored characters (brackets) take their mirror glyph in right-to-left runs. After wrapping, each
    line gets rule L1 (trailing whitespace back to the paragraph level) and its runs are put in visual order (L2).
  - **Runs**: a line is split into runs of one font, one script (Common and Inherited characters such as spaces,
    digits and punctuation join the script before them) and one bidi level; each run is shaped once per text.
  - **Shaping** (OpenType layout as HarfBuzz does it): GSUB lookup types 1-8 and GPOS types 1-9 with their lookup
    flags (ignore bases, ligatures or marks, mark attachment classes, mark filtering sets, right-to-left cursive), under
    the font's script tag (`latn`, `arab`, `dev2` then `deva`, `grek`, `cyrl`, `hebr`, ...; else `DFLT`, `dflt` or
    `latn`) and its default language system. Features on: `ccmp`, `locl`, `rlig`, `liga`, `clig`, `calt`, `rclt`,
    `kern`, `mark`, `mkmk`, `curs`, `dist`, `abvm`, `blwm` and the direction's `ltra`/`ltrm` or `rtla`/`rtlm`, plus
    the script's own; `dlig`, stylistic sets and other optional features stay off (no design option names them).
    Arabic gets its joining forms (`isol`, `fina`, `medi`, `init`, ... from the Unicode joining types, ZWJ and ZWNJ
    included) before `rlig`, `calt` and `mset`; Devanagari gets syllables (a dotted circle U+25CC before a broken
    one, when the font has it), reph, pre-base matra and half-form reordering and the Indic features (`nukt` to
    `cjct` per syllable, then `init`, `pres`, `abvs`, `blws`, `psts`, `haln`). A font without GPOS kerns with its
    `kern` table (format 0). Marks attach by their anchors (x and y offsets); their advances are zeroed.
  - **Options**: `kerning: false` on the font asset turns off `kern` only (marks still attach); a `letterSpacing`
    other than 0 turns off `liga`, `clig` and `calt`, as browsers do.
  - **Positions**: advances and offsets come in integer font units and are scaled to `fontSize` (default 16); the pen
    moves left to right over the line in visual order, `letterSpacing` (default 0) is added once after each cluster
    (a ligature or a letter with its marks counts once). The sums run in one order, so every engine adds the same
    numbers.
- The drawer only draws: each written character gets its own `x` (and a `y` list when some glyph of the `<tspan>`
  sits off the baseline, a mark on its base), one `<tspan>` per line and font run; a character above the BMP gets a
  `<tspan>` of its own, since drawers count `x` values in UTF-16 units or in code points. A glyph is written as its
  own character only when that character alone draws exactly it: one character, the glyph its `cmap` gives, no offset,
  not a mark, left to right, not itself a private-use character. Every other glyph (a ligature, a joining form, a
  mark, a reordered matra, anything in a right-to-left run) is written as a private-use character (U+E000 upwards,
  then planes 15 and 16 after 6400 glyphs of one font, numbered per font in the order glyphs are first placed) that
  the font's subset maps to that glyph. Such a `<text>` carries its own text (in NFC) as `aria-label`, so screen readers and
  copy read the words, not the private-use characters; a text with right-to-left glyphs carries
  `direction="ltr" unicode-bidi="bidi-override"`, so the drawer keeps the visual order written. The embedded subsets
  hold no GSUB, GPOS or `kern`, so neither Chromium nor resvg shapes, kerns, reorders, aligns or substitutes anything;
  a glyph no lookup changed and that sits on the baseline, left to right, is written as its own character, with the
  pen positions the renderer computed before shaping existed whenever the font applies nothing but pair kerning to
  it.
- **Missing glyphs**: a code point neither the font nor its fallbacks have is not written, so no engine draws it (no
  browser fallback font, no `.notdef` box); it takes no space either (no advance, no letter spacing, no kerning across it), so the line closes
  over it; the cluster still separates its neighbours, so they are not kerned together (Montserrat Medium at 20 px: AV measures 28.14,
  A, a dropped cluster and V measure 28.88); the spaces typed around it stay, and a word of dropped clusters only has no width and
  never starts a wrapped line (the empty word between two spaces has no width either: at a break the first of two
  spaces stays on the line, so `aaaa`, two spaces, `bbbb` wraps to `aaaa` plus one trailing space, then `bbbb`). A cluster is one user-perceived character, so an emoji sequence
  (a ZWJ family, a flag, a skin tone, a variation selector) is dropped whole; a keycap keeps its digit when a font has it and
  drops the enclosing mark U+20E3. An emoji is therefore drawn only when a font of the text has it as an outline glyph:
  add a monochrome outline emoji font (when its licence allows embedding) as a `fallback` of the text's font. Colour
  glyph formats are not drawn: a font that holds only bitmaps (`CBDT`, `sbix`) has no outlines and is refused as
  `asset-format`; a font with `COLR` or SVG glyphs next to its outlines is accepted, and a glyph that has no outline of
  its own keeps its advance (an empty space) with no warning, because the font does cover the character. No emoji font is bundled or implied. (A space variant or U+2011 the font can draw by the fallbacks above is not missing.) The render warns `missing-glyph` once per font asset a text names (also when a `fontWeight` picked
  another face of its family), naming up to ten such characters. Default ignorables (ZWJ, ZWNJ, bidi controls,
  variation selectors, ...) take part in shaping and bidi, are never drawn and never count as missing, so the warning
  names the characters that carry a cluster: pictographs, but also the keycap mark U+20E3, regional indicators (a flag)
  and skin-tone modifiers. A dropped cluster inside a word still separates the letters around it for joining (Arabic) and ligatures.
- **Remaining limits of shaping**: only Arabic and Devanagari have shapers of their own; every other script (Hebrew,
  Thai, Bengali, Tamil, Khmer, Myanmar, the scripts HarfBuzz's USE shaper handles, ...) gets the font's GSUB and GPOS
  features through the default shaper, without syllable reordering. Only the default language system is used (no
  design field names a language, so Urdu or Marathi forms are not chosen). Normalization is canonical only (no NFKC),
  leaves a run of more than 32 marks unsorted (and its Arabic modifier marks unmoved), moves modifier marks only in
  clusters of Arabic script (not on a Latin letter, nor on a tatweel or U+25CC in a run of another script) and reorders no other script's marks beyond
  the modified classes; a character missing from the font is not replaced by a similar one, except the space variants and
  U+2011 (Text, Space and hyphen fallbacks). No vertical text, no variable-font axes,
  no fallback shaping for fonts without layout tables (Arabic presentation forms). Characters of one word in different
  fonts do not join or attach across the font change.
- A line break in the content is a hard break. With a `width`, words (split at breakable spaces: U+0020, U+2000-2006, U+2008-200A, U+205F, U+3000; U+00A0, U+2007 and U+202F never break) fill each line greedily; a word
  wider than the line breaks between clusters, never inside one (a ligature, a letter with its marks, a conjunct). Word widths include kerning inside the word; kerning across a space
  is left out of the wrapping decision (it is in the final positions). The space at a soft break is dropped, every
  other space is kept (`xml:space="preserve"`).
- The box is the `width` (or the widest line) by `lines x lineHeight x fontSize` (`lineHeight` default 1.2). The
  first baseline sits half the leading plus the ascender below the box top (the ascender and descender of `hhea`, or of
  `OS/2` when the font sets USE_TYPO_METRICS), of the font the text names.
- Characters XML does not allow (see Output) are removed from the filled-in content before it is measured and
  wrapped, so such a text lays out and renders byte-identical to the same text without them.
- `align` (`start`, `middle`, `end`) moves each line by the free space of the box before the positions are written:
  `start` puts a line at the start of its paragraph's direction (the left edge, or the right edge for a right-to-left
  paragraph), `end` at the other edge, `middle` in the centre; there is no `text-anchor` and no `letter-spacing`
  attribute.
- A gradient fill of a text spans the text's layout box (`gradientUnits="userSpaceOnUse"` with a transform onto the
  box), not the ink of the glyphs, which each drawer measures differently; text drawn as paths uses the same box.
- Every `<text>` carries `text-rendering="geometricPrecision"`: without it Chromium on Linux rounds hinted glyph
  advances to whole pixels and draws the text wider than the renderer measured it.

## Fonts

- **Formats**: TrueType (`.ttf`), OpenType with CFF outlines (`.otf`), WOFF and WOFF2 holding either. A collection
  (TTC, or WOFF2 holding several fonts) and CFF2 outlines fail with `unsupported-font`; a variable TrueType font is
  read as its default instance (no axes). WOFF and WOFF2 are checked against `maxFontBytes` from their headers before
  anything is decompressed, and every table must decompress to exactly its declared size (a decompression bomb stops
  there: `asset-format`); the WOFF2 glyf, loca and hmtx transforms are reversed.
- **Embedded as a subset**: once every text is laid out, each font that draws text gets one `@font-face` rule whose
  source is a WOFF data URI (`data:font/woff;base64,...`) of a subset holding exactly the characters drawn with it
  (plus `.notdef` and the components of composite glyphs), so its size follows the glyphs used, not the file. The
  subset keeps `head`, `hhea`, `maxp`, `OS/2` (with `fsType`), `hmtx`, a new `cmap` (format 4, plus 12 above the BMP;
  it also maps the private-use characters shaped glyphs are written as, see Text),
  `post` 3, the Windows `name` records 0-6, 13, 14, 16 and 17 (copyright and licence travel with the font) and the
  outlines (TrueType without hinting instructions, or CFF flattened: no subroutines, no hints). Everything else is
  dropped. Subsets are WOFF (zlib, level 9), not WOFF2: there is no pure-JavaScript Brotli encoder that gives the same
  bytes in Node and in every browser, and the subset must be byte-identical everywhere. Fonts no text draws with are
  never embedded; fallback fonts are loaded only when a character needs one.
- **As paths**: an asset with `drawAs: "paths"`, and every font whose licence forbids embedding, is drawn as path
  data: one `<path>` per text, every glyph's outline placed where the layout put it, `fill-rule="nonzero"`, the text (in
  NFC) as its `aria-label`, the same fill, opacity and rotation. Nothing of the font is embedded. When any font a text uses is
  drawn as paths, the whole text is. The path data is checked against `maxOutputBytes` glyph by glyph while it is built.
- **Licence**: a font is embedded only when its asset declares `licence.embedding: "allowed"` and its OS/2 `fsType`
  permits embedding (neither the restricted-licence bit `0x0002` nor the bitmap-only bit `0x0200`; the stricter reading
  wins). Otherwise its text is drawn as paths and the render warns `font-not-embeddable` once for the asset; this also
  holds for a restricted font that is only a fallback.
- **Reserved Font Name**: under the SIL Open Font License a subset is a Modified Version, and a Modified Version may
  not use a Reserved Font Name (RFN). A font with one is therefore never embedded as a subset: its text is drawn as
  paths (nothing of the font is embedded) and the render warns `font-reserved-name` once for the asset, also when it
  is only a fallback. The subset is not renamed instead: it would carry a family name other than the one the SVG asks
  for, and rasterizers match the name inside the font (see [raster.md](raster.md)). The first of these that applies
  decides: the asset's `licence.reservedFontName` (`true` forces paths; `false` embeds, e.g. with written
  permission from the holder of the name), then its SPDX `licence.name` (`OFL-1.0-RFN` and `OFL-1.1-RFN` have one,
  `OFL-1.0-no-RFN` and `OFL-1.1-no-RFN` none; compared without ASCII case), then the font's name table: the copyright
  (name 0) or licence description (name 13) says "with Reserved Font Name" (any ASCII case, also "Names") followed by
  a name, not by the OFL template's `<Reserved Font Name>` (so the OFL text itself, which only defines the term, is no
  statement; a colon after the phrase is skipped), whatever licence the font or its asset names, and only when the
  font's own family name (name 1 or 16) uses it (any ASCII case): it contains a stated name, or, for an unquoted
  statement, the text up to the sentence end shares a whole word with it (a word is a run of ASCII letters and digits
  or characters from U+0080 up; so trailing words, a following copyright line or a family name wider than the stated
  name hide nothing); after a quote every quoted name counts whatever separates them, and the words outside the quotes
  count as for an unquoted statement. A renamed fork that keeps the upstream
  copyright line but not the name is embedded as before. A statement whose names cannot be told apart, or a font
  without a family name, counts as used. The warning points at what decided: `licence/reservedFontName`, `licence/name` or the asset.
  A restricted font warns only `font-not-embeddable`, and `drawAs: "paths"` draws an RFN font as paths without a
  warning. Detection reads only the name table (other licence texts, name 7 and the trademark are not read) and
  decodes at most 131072 characters of names per font, so a crafted table costs nothing; a statement it misses is
  declared with `licence.reservedFontName: true`.
- **Fallback**: `fallback` lists up to 8 font asset ids, tried in order for each character the font lacks. It is not
  transitive (a fallback's own fallbacks are not used), and within each fallback's family the weight and style of the
  text are matched as for the text's own font. A fallback character gets its own `<tspan>` with the fallback's
  family, weight and style.
- **Weight**: a text's `font` names an asset; with a `fontWeight`, the renderer picks among the assets of the same
  `family` and `style` by CSS font matching (declared `weight`, default 400; equal weights prefer the named asset, then
  the smallest asset id) and writes that asset's weight. Bold is never synthesized.
- **Style**: the text is drawn in the style of the asset its `font` names; an `italic` asset gets
  `font-style="italic"` on the text and `font-style:italic` in its `@font-face` rule, so a regular and an italic asset
  of one family each draw with their own face.
- **Family**: the SVG asks for the asset's `family`. Rasterizers (resvg in raster export, [raster.md](raster.md), and in the goldens) match fonts by
  the family name inside the file, so an asset whose `family` differs from it renders, but with the warning
  `font-family-mismatch`. Family names are written as CSS strings with `\ " ' < > ( ) @` and line breaks escaped;
  rasterizers compare names literally, so keep such characters out of family names. Two assets with the same family,
  weight and style both embedded in one SVG compete for the same `@font-face` descriptors; give them distinct families.
- **Untrusted fonts**: every table offset and count is checked against the bytes; composite glyphs nest at most 8
  deep with at most 256 components and 65535 points; CFF charstrings call subroutines at most 10 deep, keep at most 48
  operands and run at most 20000 operations per glyph. The layout tables (GDEF, GSUB, GPOS) are bounded by counts,
  never by time, so a hostile font fails the same way everywhere: at most 1024 lookups per table and 64 subtables per
  lookup; feature selection visits each feature once and reads at most 4096 lookup indices; an extension lookup may
  not point to another extension; a context rule or ligature names at most 64 glyphs; lookups nest at most 8 deep;
  shaping one text (every word measured and every line laid out, together) spends at most max(16384, 128 x the text's
  length) operations (a subtable tried, a glyph stepped over, a rule, ligature or lookup entry compared, glyphs
  moved; the Devanagari probes for reph and below-base forms included, each answered once per font); one shaping call
  grows its buffer to at most max(4096, 8 x its characters) glyphs; a mark finds its base by searching back only to
  where the last search stopped (HarfBuzz's last base), and a cluster holds at most 32 code points, so long runs of
  marks or conjuncts cost linear work; Coverage tables are read once each and together no further than the table's
  size. The bidi algorithm is
  linear in the text (embedding depth 125, bracket pairs 63 deep). Outlines, layout tables and subsets are read on
  first use: a fault found then, or a cap passed, is `asset-format` at the asset's `src`. The outline work of one render, all fonts together
  (charstring operations, TrueType points; text drawn as paths reads each glyph once, CFF subsets are flattened through
  the same budget), is at most 4000000; the font whose outlines cross it fails the render with `asset-too-large` at
  that asset, in the same order on every run. A subset whose outlines pass four times the output budget still left
  while it is built fails the same way, as does the subset that brings all subsets of the render past four times
  `maxOutputBytes` uncompressed. The fonts of a render decode to at most `maxTotalFontBytes` together (see Limits): an
  asset's source is checked against what is left before it decodes, and assets with the same source (the same
  supplied bytes, or the same data URI) decode it once; the CLI and the Action read a path used by several assets
  once. A CFF font whose FontMatrix is not 1/unitsPerEm is `unsupported-font`.
- **`@readmint/fonts`**: `parseSfnt(bytes, { maxBytes? })` reads TTF, OTF, WOFF and WOFF2 into an `SfntFont` (metrics,
  `glyphFor`, `advanceOf`, `bearingOf`, `kerning` (the GPOS kern lookups applied to the pair by the shaping engine,
  else the `kern` table), `outline(glyph, budget?)`, `table(tag)`, `container`, `outlines`, and `sfntBytes`: the size
  of the sfnt it was read from, decoded, which the renderer charges against `maxTotalFontBytes`; and
  `reservedFontName`: whether its name table states a Reserved Font Name);
  `shapeText(font, text, { script?, rtl?, kerning?, ligatures?, budget? })` shapes one run into a `ShapedRun` (glyphs, UTF-16
  cluster starts, advances and x/y offsets in font units, mark flags, in visual order), spending a `ShapingBudget`
  (its own, or one shared by many calls: `ShapingBudget.forText(length)`); `normalizeForFont(font, text)`: the
  characters `shapeText` maps through the font's `cmap` (see Text, Normalization); `normalizeNfc(text)`; `glyphForCharacter(font, codePoint)`: the glyph that draws a character, the space or hyphen fallback included (0 for none); `resolveLevels(text,
direction?)`, `lineLevels(paragraph, start, end)` and `visualOrder(levels)` (UAX #9); `clusterStarts`, `scriptOf`,
  `isDefaultIgnorable`, `isNonSpacingMark` (from the package's own Unicode 16.0.0 tables, never from RegExp property
  escapes or `Intl`, whose Unicode version differs between Node and browsers); `subsetFont(font, codePoints, {
budget?, maxBytes? })`, `encodeWoff`, `decodeWoff`, `glyphClosure`, `OutlineBudget`, and the errors `MalformedFont`
  and `FontRefused` (`unsupported`, `too-large`).
- **Behaviour changes for existing designs** (no format version step, see
  [design-format.md](design-format.md#versioning)): pair kerning is on by default, so text is placed slightly
  differently than before (`kerning: false` per font asset turns it off); `font-not-embeddable` is a warning (the text
  is drawn as paths) where the render used to fail; a text gradient spans the layout box, not the glyph ink. A caller
  that treated `font-not-embeddable` as a failure must now look at the warnings. Since RM-45, a font with a Reserved
  Font Name (declared by its asset, or stated in its name table) that was embedded as a subset is drawn as paths with
  the warning `font-reserved-name`. Since shaping (RM-44), fonts with
  `liga`, `ccmp` or `mark` draw standard ligatures (fi, fl, ...) and attach combining marks, right-to-left text is
  reordered, `align` start and end follow the paragraph direction, pair kerning skips marks its lookup ignores, and
  font-mode text may hold private-use characters with an `aria-label`. Plain text keeps its exact positions only where the font does nothing but pair kerning to it: contextual alternates (`calt`, e.g. a font that changes the colon in 12:30), `ccmp` or `locl` substitutions of plain Latin, contextual kerning (GPOS 7/8), non-Latin text now kerned under its own script tag, and the lost pair kerning across a script change (two runs) all move or change plain text too. Since RM-53, text is
  normalized before shaping: decomposed text recomposes into the font's precomposed letters (now plain characters, as
  precomposed text always was), a precomposed letter the font lacks is drawn from its base and mark in the same font
  instead of a fallback or a missing glyph, marks typed out of canonical order are sorted, a text's `aria-label` is
  written in NFC, a cluster whose font has its base but not its mark (or not the whole cluster as normalized) moves
  whole, base included, to the first fallback that has all of it (before, only the mark took the fallback and drew
  unattached; a fallback in another family can now draw the base letter too), and letters excluded from composition (Devanagari U+0958-U+095F, Hebrew presentation forms such as
  U+FB2A) are drawn from their base and nukta or point by the font's own features, not from the font's precomposed
  glyph. Since RM-77, a character no font has no longer keeps the advance of `.notdef`: text with emoji or other uncovered characters
  is narrower than before and lines wrap later. Since RM-60, a space variant (U+00A0, U+2000-U+200A, U+202F, U+205F, U+3000) or U+2011 a font lacks is drawn
  from the font's own space or hyphen glyph, no longer reported as `missing-glyph` or taken from a `fallback` font:
  a primary without U+2009 but with a fallback that has it now draws its own space at 1/5 em. Since RM-59, Arabic text
  with modifier marks (U+0654, U+0655, U+0658, U+06DC, ...) stacks them nearest the base, before the vowel marks
  (U+0628 U+064E U+0654 draws the hamza under the fatha), so such text can draw differently.
- **Dependencies**: `fflate` 0.8.3 (MIT; zlib inflate for WOFF input, deflate for the subsets) and `brotli` 1.3.3
  (MIT, its decoder a port of Google's Apache-2.0 decoder; only `brotli/decompress.js`, for WOFF2 input) with `base64-js`
  1.5.1 (MIT). Both are pure ECMAScript and run the same in Node and browsers. In the Action bundle they add about
  140 kB (brotli 122 kB of which 69 kB is its dictionary, fflate 18 kB, base64-js 3 kB); the bundle takes brotli's
  compressed browser dictionary instead of its 756 kB Node one. brotli ships no licence file; the Action's licence
  banner takes its MIT and Apache-2.0 texts from `packages/action/scripts/licences/brotli.txt`. The shaping engine
  and its Unicode tables (generated from the Unicode Character Database 16.0.0 by
  `packages/fonts/scripts/generateUnicodeTables.ts`, under the Unicode License V3 kept in the generated file and in
  `packages/fonts/LICENSE-UNICODE`) need no dependency; they add about 77 kB minified (31 kB gzip, 15 kB of it the
  tables, the canonical decompositions and combining classes included) to `@readmint/fonts`.

## Images

- Accepted by magic bytes: PNG (APNG), JPEG, GIF, WebP. SVG and anything else is `asset-format`; a `data:` URI whose
  type differs from the sniffed one is `asset-format`. The bytes are re-encoded as a data URI of the sniffed type,
  with their colour-management data removed (below).
- Checked before anything is decoded: size, then dimensions from the header, then animation frames (GIF image
  descriptors, APNG `acTL`, WebP `ANMF`). `sniffImage(bytes, maxFrames)`, exported, is that check (format, size, frames, EXIF
  and its orientation, and where the colour data lies, `colourData`, from the headers alone); raster export sizes its
  image decoding budget with it.
- A JPEG not every output draws is `asset-format`: Chromium (libjpeg) draws nothing for the markers it rejects, and
  resvg (jpeg-decoder) draws nothing for RST0-7, TEM, DNL, DAC and a segment shorter than its two length bytes, so the
  asset is refused with the marker named instead of an empty box in one output or both. Up to the image data (SOS),
  before or after the frame header, the markers read on are DHT, DQT, DRI, APP0-15 and COM (skipped by their length, at
  least 2). Refused, the message naming the marker: RSTn, TEM, DNL, DAC, a segment length below 2, a second SOI, EOI before the image data, a second
  frame header, and any other code (`02`-`BF`, `DE`, `DF`, `F0`-`FD`). Accepted are SOF0, SOF1 and SOF2 (baseline,
  extended and progressive Huffman) with 8-bit samples, and 8-bit RGB-coded lossless (SOF3, below): SOF5-7, `C8` and
  SOF13-15 libjpeg does not draw, and the rest is refused because the outputs differ, as probed with genuine files
  (Chromium 156, resvg-wasm 2.6.2, fixtures in `packages/renderer/test/assets/jpeg`): Chromium draws them all except
  16-bit DCT samples (0x0), resvg draws arithmetic coding (SOF9-11), DCT samples above 8 bits and 12- and 16-bit
  lossless grey empty, and traps on a 12-bit lossless RGB file. A DCT frame header whose length is not 8 plus 3 per
  component, or which has no component, is refused too.
- The whole JPEG, every frame type, is read once from SOI to EOI and held to what Chromium (libjpeg-turbo 3.1) and
  resvg (jpeg-decoder 0.3.1) were measured to draw alike, as far as the probes named below reach (lossy pixel
  rounding apart); the rest is `asset-format` with the reason named. jpeg-decoder fails, so
  resvg draws nothing, on much that libjpeg reads or ignores, and reads the colour space differently. Past the first
  scan the sniffer skips the image data (stuffed zeros, fill bytes, RST0-7) up to the next marker; only SOS, DHT, DQT,
  DRI, APP0-15, COM and EOI may follow (a restart marker only right after the data). Refused, wherever they are:
  - segments: an Adobe APP14 (`Adobe\0`, 12 bytes or more) with a transform above 2; a DQT table of precision above
    1, with a zero entry, an id above 3 or a wrong length; a DHT table without codes, with more codes of a length than
    fit, of class above 1 or id above 3, or a wrong length; in a baseline (SOF0) file, past its frame header, a DHT of
    table 2 or 3 (jpeg-decoder allows tables 0 and 1 there; before the frame header any); a DRI whose length is not 4;
  - frames: 4 components (CMYK and YCCK: resvg draws them empty), any count but 1 or 3, a component id twice,
    sampling factors outside 1-4 or not an integral ratio of the largest, a quantization table above 3;
  - scans: a header of a wrong length or 0 or more than 4 components; a component the frame lacks or out of frame
    order; a Huffman table selector above 3 (above 1 in SOF0); a Huffman table no DHT defines yet (libjpeg-turbo then
    uses its default tables, jpeg-decoder draws nothing), except tables 0 and 1 of a sequential scan after an AVI1 APP0
    (Motion JPEG: both use the default tables); a Huffman table with a code of all ones (libjpeg fails on it, though
    only where a scan uses it); a DC table holding a category above 15 (16 lossless) that a scan decodes differences
    with (libjpeg fails to build it, jpeg-decoder only on decoding one); a quantization table no DQT defines; a sequential (SOF0, SOF1)
    scan whose spectral selection is not 0-63 (or 0-0) or whose successive approximation is not 0; progressive
    parameters jpeg-decoder rejects; more than 10 blocks per MCU; a scan of a component already complete (jpeg-decoder
    skips it, libjpeg applies it); a quantization table redefined between two scans of one component;
  - after the image data: any other marker (TEM, SOI, DNL, a restart after a segment, SOFn, DAC, EXP, `02`-`BF`, ...),
    and fill bytes before a stuffed zero inside the data (`FF FF 00`);
  - at EOI: a component whose 64 coefficients no scan completed (libjpeg draws what it has, jpeg-decoder nothing), and
    for 3 components a colour space the two pick differently: libjpeg reads a JFIF APP0, then an Adobe transform (0
    is RGB), then the ids `R` `G` `B`, all before the first scan; jpeg-decoder reads the ids first (1 2 3 YCbCr,
    `R` `G` `B` RGB, 1 34 35 and `r` `g` `b` not at all), then JFIF, then Adobe (2 not at all), from anywhere
    up to EOI.

  Several scans, restart markers, tables, APPn and COM between the scans and before EOI stay accepted, as does a
  table 2 defined before a baseline frame header. A file that ends before EOI: a sequential (SOF0, SOF1) one neither
  output draws, so it stays accepted; of a progressive (SOF2) one Chromium draws what its scans hold and resvg
  nothing, so it is refused; a lossless one is refused (below). Every rule is pinned in both outputs (`packages/renderer/test/jpegStructureCases.ts`
  and `jpegMarkers.ts`: Chromium 156, resvg-wasm 2.6.2); a few that both draw nothing for are refused to name the
  reason.

- The image data of every scan, lossless too, is decoded to its Huffman symbols, never to pixels (no dequantization,
  no IDCT), the way both decoders walk it: MCU order (interleaved, `ceil(W/8Hmax)` x `ceil(H/8Vmax)` MCUs of `h` x `v`
  blocks per component; non-interleaved, the component's own blocks), restart intervals (the RSTn due in sequence
  after the padding bits, predictors and end-of-band run starting over), end-of-band runs and the correction bits of
  refinement scans, which take a history of nonzero coefficients per block of a progressive frame. Refused, as
  Chromium draws what it decoded and resvg nothing or other pixels: a code no code of up to 16 bits matches; a DC
  difference of category 12-15; a run of coefficients past the end of the block (sequential) or band (progressive,
  first or refinement scan); an end-of-band run (EOBn) in a sequential scan (jpeg-decoder reads its bits and skips the
  next blocks' coefficients, libjpeg ends the block); a refinement coefficient of a size other than 1; another marker
  than the restart marker due, or none, where a restart interval ends. Refused fail-closed, as the probe found them
  drawn alike in some files and apart in others: image data a marker cuts short before its last block (libjpeg fills
  the rest grey or leaves it as earlier scans had it, jpeg-decoder decodes zero bits, which agree only by chance);
  bytes between the padding and a restart marker (libjpeg skips any, jpeg-decoder looks only a few bytes ahead); a
  coefficient whose magnitude times its quantization entry (the component's DQT table at the coefficient's zigzag
  position) passes 4096, a coefficient of a progressive scan taken at the most the refinement bits still to come can
  make it (`((|v| + 1) << Al) - 1`, a new refinement coefficient `(2 << Al) - 1`): an 8-bit encoder writes at most
  about 1024 plus half the entry, and the two drew a block of one such coefficient alike up to 4096 and apart from
  8192 on (DC 1024 at entry 8, AC 1000 at 16, AC 200 at 64, AC 600 at 255: libjpeg-turbo's 16-bit arithmetic
  overflows where jpeg-decoder's 32-bit one does not); a block whose coefficients in columns u and u + 4 (horizontal
  frequencies, DC in column 0) sum to more than 4608 in dequantized magnitude, refinement bits included (a
  progressive block's sums are kept across its scans, 8 bytes per block): libjpeg-turbo's SIMD IDCT keeps its first
  pass in 16 bits and adds and subtracts the outputs of those two columns in 16 bits, so coefficients each well
  within 4096 overflow together (all 63 AC of a block at 1000 Chromium draws black where resvg draws white), from a
  pair of 5906 on by that arithmetic; blocks scaled to a given pair were drawn alike up to 5888 and apart from 6008
  on, and genuine encodings reach 3430 (Pillow/libjpeg-turbo, high-contrast and worst-case patterns at quality 1 to
  100, grey, 4:4:4 and 4:2:0, baseline and progressive; a search over 8-bit blocks found 4080 with the standard tables, chroma at quality 1 to
  10, and an 8-bit block at quality 100 stays within 4096; a custom table with steps near 512, which only 16-bit
  precision tables allow, can round a genuine block past 4608, and such a block is refused too, fail-closed), all
  measured on x86-64 Chromium (other SIMD paths, ARM NEON among them, are not probed); lossless data has no
  quantization and no such rule; a progressive scan out of
  progression order, as that bound holds only in order: per component and coefficient (DC and AC alike), a first scan
  (`Ah` 0) of a coefficient an earlier scan already holds, or a refinement (`Ah` > 0) whose `Ah` is not the `Al` of
  the coefficient's latest scan, a refinement before any first scan included (libjpeg only warns and applies it,
  jpeg-decoder checks nothing; a refinement that jumps from bit 1 to bit 5 adds 32 to a coefficient of 2, which at
  entry 255 Chromium draws black and resvg white); a non-interleaved scan
  whose blocks the two count differently (a component sampled 2 under a largest 4: libjpeg
  rounds the component's width up to blocks, jpeg-decoder pads it to whole MCUs; from the source, not drawable in the
  32x16 probe). Accepted, as both draw them alike: padding bits other than ones, bytes after the last block up to the
  next marker, an end-of-band run past the end of the scan, and lossless differences of category 9-16 (both keep the
  sum modulo 2^16 and draw its low byte). Where the data runs out without any marker the file is a cut one (above).
  Measured with built files of exact symbols and the gradient, `progressive.jpg` and `sof3-8bit-rgb.jpg` broken in
  place, every kind pinned in both outputs (`packages/renderer/test/jpegEntropyCases.ts`: Chromium 156, resvg-wasm
  2.6.2). The check is bounded (see Limits) and takes about 100 ms for a 3 MB baseline file, 200 ms for a progressive
  one. An accepted JPEG's result is kept by its bytes for the module instance (at most 64 images and 32 MiB of image
  data, the least recently used dropped first; a hit needs the bytes equal byte for byte, so a hash collision is a
  miss; refused files are checked every time), so a repeated render, every frame of an animation and the raster pass
  skip the check for bytes already checked: a hit costs a hash and a comparison of the bytes, some 17 ms for a 3.5 MB
  file. The copy the SVG holds (orientation upright, colour data removed) is kept too, with what its check finds,
  derived from the original's check. Results and output never depend on the cache (see Limits).

- Lossy pixel values the two decoders round apart are bounded by a pinned tolerance: at most 2 levels per channel
  (`jpegChannelTolerance`, `packages/raster/test/jpegDecoderTolerance.ts`), as libjpeg-turbo (Chromium) and
  jpeg-decoder (resvg) round the IDCT and the chroma upsampling apart. Measured over every pixel and channel at native
  size (Chromium 156.0.8078.4, resvg-wasm 2.6.2; `jpegDecoderDifference.browser.test.ts`): `gradient.jpg` (baseline
  4:2:0) 2, `progressive.jpg` 2, `baseline-422-restart-rows.jpg` 1, `progressive-420-restart3.jpg` 1. The test fails
  on a difference above the tolerance, on a changed measurement and on a tolerance above the largest measured one, so
  a browser or decoder update shows up there; the fixtures are tiny (32x16, 37x23), so larger photographs are not
  probed.

- A lossless JPEG (SOF3) is accepted only where Chromium and resvg draw the same pixels: resvg-wasm 2.6.2 decodes with
  jpeg-decoder 0.3.1, whose lossless path copies the stored samples without any colour transform (it ignores JFIF,
  Adobe and the component ids) and one per component and pixel whatever the sampling factors; Chromium (libjpeg-turbo
  3.1) converts no colour in lossless mode and draws only what it reads as RGB. So, up to the first scan header (SOS),
  on either side of the frame header: (1) 8-bit samples, three components with ids `R` `G` `B` (82 71 66) in that
  order, each sampled 1x1 with quantization table 0; (2) no APP0 whose data starts `JFIF`; (3) every APP14 whose data
  starts `Adobe` is at least 12 bytes long with transform 0 (libjpeg takes the last one, so all must agree); (4) no DRI;
  (5) the first scan holds `R` `G` `B` in frame order, each on Huffman tables 0 (selector byte 0), predictor 1-7, no
  spectral end, successive approximation or point transform; (6) its image data, read once past stuffed zeros
  (`FF 00`) and fill bytes, holds one difference symbol per sample (checked like any scan, above) and ends at the
  end-of-image marker (EOI): a file cut before or inside the scan, one without
  EOI, a second scan, a restart marker or any other marker before EOI is refused (a DCT file cut after its frame
  header is still read). Chromium draws the rows it has of a cut file and resvg nothing; of two scans Chromium draws
  the first and resvg the second. Anything else is `asset-format` with `JPEG frame type 0xC3 (lossless) is
refused:` and the reason (`a JFIF segment`, `Adobe transform 1`, `component ids 1 2 3`, `sampling 1x2`,
  `precision of 12 bits`, `a second scan`, ...). The outputs differ on grey (black in Chromium), YCbCr (other
  colours), JFIF and Adobe transform 1 or 2 (empty in Chromium), sampling factors other than 1x1 (resvg ignores them),
  a quantization table other than 0 or a table selector above 3 (empty in resvg) and a point transform. Ids 1 2 3, a
  short Adobe segment, a restart interval of 0, AC table selector 1 and a restart marker or COM before EOI draw alike
  in the probe but are refused fail-closed: reading other ids as RGB in lossless is libjpeg-turbo 3 alone (IJG libjpeg
  and jpeg-decoder's colour rule read 1 2 3 as YCbCr), and no restart (an interval above 0) was probed. Measured with
  genuine
  libjpeg-turbo 3.1.3 files (`sof3-8bit-rgb*.jpg`, predictors 1-7, with and without Adobe APP14) and segment edits of
  them; a Chromium or resvg upgrade that changes a pin fails the tests and asks for a new probe.
- EXIF orientation (tag `0x0112` in IFD0 of a JPEG APP1 `Exif` segment, a PNG `eXIf` chunk before or after the image
  data, or a WebP `EXIF` chunk) is applied by the renderer, never by the decoder: browsers honour the tag and resvg
  does not, so leaving it to them would draw the preview and the raster output differently. The inlined copy has every
  Orientation entry rewritten to SHORT 1 in place (same length, so no offset moves; a PNG `eXIf` chunk gets its CRC
  recomputed); the asset's own bytes are never changed. The `<image>` then sits at `x="0" y="0"` with the layer's width
  and height (swapped for orientations 5-8) and `transform="matrix(...)"` maps that box onto the layer's, so `fit`
  works on the upright picture; a layer `rotation` comes first in the `transform` list and turns the result around the
  layer's centre. Orientation 1 (or none) draws exactly as before.
- Which EXIF counts follows what Chromium reads: a JPEG APP1 segment is EXIF by its first five bytes `Exif\0` (the
  sixth may be anything). Before the frame header the segments must follow each other exactly (stray bytes, `FF 00`
  included, are `asset-format`); past it markers are read as libjpeg's `next_marker` reads them: bytes up to a 0xFF
  are skipped, then 0xFF fill bytes, `FF 00` is a stuffed zero and the scan goes on. A PNG or WebP block may start with the same six-byte
  prefix. The first EXIF block holding an Orientation entry
  decides, its first entry of type SHORT with count 1; a value outside 1-8, another type or count, an entry only in
  IFD1, or a block whose TIFF header or IFD0 lies outside it counts as 1 and is never an error.
- Colour-management data is removed from the inlined copy, never applied: Chromium colour-manages an image by its
  embedded ICC profile and PNG colour chunks, resvg ignores them, so the preview would draw other colours than the
  raster output (a Display P3 or Adobe RGB profile, a P3 cICP or cHRM, gAMA 1.0 alone: 40 to 73 levels per channel
  apart). Removed, as whole segments or chunks, where decoders read them: JPEG APP2 `ICC_PROFILE\0` segments before
  the first SOS, with the 0xFF fill bytes before the marker, so the copy's walk meets the same markers where stray
  bytes follow the segment (every part of a split profile; another APP2 stays), and the segments that lead a decoder to an Ultra HDR gain map: APP2 `MPF\0` and APP1 XMP (`http://ns.adobe.com/xap/1.0/\0`) naming the `http://ns.adobe.com/hdr-gain-map/1.0/` namespace (a second image after the first EOI is left: nothing then points to it), so the pixels drawn are the SDR base image in both Chromium and resvg); PNG `iCCP`, `sRGB`, `gAMA`,
  `cHRM`, `cICP`, `mDCV` and `cLLI` before the first `IDAT` (no decoder reads later copies); WebP `ICCP` chunks inside
  the RIFF payload (bytes after it are left alone), with the VP8X ICC flag (0x20) cleared, with or without a chunk,
  and the RIFF size lowered by the bytes removed. Every
  other byte stays; a segment or chunk the data cuts off is not removed. The removal runs after the EXIF rewrite, whose
  offsets it would move. A GIF's `ICCRGBG1` `012` application extension stays: Chromium draws it unapplied, as resvg
  does. No profile is parsed and no pixel is converted, so Chromium and resvg agree for every profile: an image tagged
  Display P3 or Adobe RGB draws its stored values as sRGB in both, less saturated than a colour-managed viewer shows
  it; an sRGB profile, the PNG `sRGB` chunk and gAMA 45455 alone Chromium was measured to draw as untagged, so
  removing them changes nothing. Probed with Chromium 156.0.8078.4 and resvg-wasm 2.6.2 on Pillow 12.0.0 files
  (`packages/renderer/test/assets/colour`, provenance in `colourImages.ts`); pinned by `colourImages.browser.test.ts`
  (renderer), `colourImages.test.ts` (raster) and the `image-colour-profiles` golden.
- `fit`: `contain` (default) = `preserveAspectRatio="xMidYMid meet"`, `cover` = `xMidYMid slice`, `fill` = `none`.
  `alt` becomes `aria-label`.
- An image drawn once is an `<image>` holding its data URI. Image data drawn more than once (a `repeat`, several
  layers, or several assets whose inlined copies are the same bytes, such as two that differ only by a colour
  profile) is written once: an `<image id="d<hash>-i<hash>">` at its own pixel size in
  `<defs>`, one `<symbol id="d<hash>-s<hash>">` per `fit` that shows it (its `viewBox` and `preserveAspectRatio` do what the
  inline image does, its viewport clips like `cover`), and per layer a `<use>` with the layer's `x y width height`,
  opacity and rotation. A `<use>` with an `alt` gets `role="img"` beside its `aria-label`, so it keeps the accessible
  name an `<image>` has. Animation classes and transform groups apply to the `<use>` as to an `<image>`. An image
  with EXIF data (JPEG APP1 `Exif`, PNG `eXIf`, WebP `EXIF`) is never shared and stays an inline `<image>` at every
  use, each carrying its own orientation transform.
- An animated GIF, APNG or WebP is inlined with every frame; browsers play it, rasterizers draw the first frame. The Node golden
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
  `class="r<hash>"`. An SVG inlined into a web page shares the page's style: the prefix keeps two different
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
  `draw` (their length needs trigonometry); an arc a template `d` gives under a `draw` track is `range` at the track.
- `x`, `y`, `rotation` and `scale` each get a `<g>` of their own around the element, outermost first in that order,
  whose CSS animates only that group's `transform` (the element keeps its own `transform` for its static `rotation`).
  With a rotation or scale the groups sit in `<g transform="translate(cx cy)">` and the element is drawn moved by
  `-cx -cy`, so both turn around the centre of the laid-out box. Layout never sees the animation.
- resvg-js ignores `@keyframes`, `animation` and `@media`, which is why the static attributes carry frame 0.
- Layers off the canvas ([Layers](#layers)): a frame places every layer by its sampled transforms (and an `opacity`
  track makes a layer one of its own), so it leaves out a layer while its tracks hold it wholly off the canvas. The
  animated SVG keeps every animated layer and everything inside one, since its CSS may move them onto the canvas; its
  frame-0 attributes may then hold a layer far off the canvas, which a resvg drawing of the animated SVG itself (not a
  frame) would abort on. Raster export always draws frames.

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
  URI or a `#fragment` of the same document, every `url()` a `#fragment` or (in the style) a `data:font/woff` URI;
  every fragment names an id the document defines. Every string from the design or the data is XML-escaped, after
  removing the code points XML 1.0 does not allow: the C0 controls except tab, line feed and carriage return, lone
  surrogates, U+FFFE and U+FFFF (GitHub free texts such as a bio may hold them).
- Path data whitespace SVG does not know (vertical tab, form feed, no-break space, line separator, ...) is written as
  a space; the path keeps its meaning and its box.
- Numbers are rounded to 3 decimals (`-0` printed as `0`), computed only with exactly specified arithmetic (no
  trigonometry: rotation is a `rotate()` transform for the drawer), so Node and browsers print the same digits.

## Limits

`RenderLimits` (override per call with `limits`):

| limit                   | default  | why                                                                                                                                       | issue                |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `maxOutputBytes`        | 5242880  | GitHub's camo proxy refuses larger images                                                                                                 | `too-large`          |
| `maxImageBytes`         | 4194304  | one image, decoded size, checked before decoding                                                                                          | `asset-too-large`    |
| `maxFontBytes`          | 4194304  | one font, decoded size, checked before decoding                                                                                           | `asset-too-large`    |
| `maxTotalFontBytes`     | 16777216 | every font of the render together, decoded size (WOFF/WOFF2 as declared, before inflating); one source used by several assets counts once | `asset-too-large`    |
| `maxImageSide`          | 8192     | pixels per side; keeps the raster path within memory                                                                                      | `asset-too-large`    |
| `maxAnimationFrames`    | 1000     | frames of an animated image                                                                                                               | `asset-too-large`    |
| `maxTextLength`         | 10000    | characters of a text after its placeholders are filled                                                                                    | `too-large`          |
| `maxExpressionSteps`    | 5000000  | expression work of the whole render (under a second of the costliest string filters), including copies an `if` drops                      | `binding` (`budget`) |
| `maxRepeatCopies`       | 100000   | copies made by every `repeat` of the render together, including copies an `if` or `visible: false` drops                                  | `too-large`          |
| `maxAnimationKeyframes` | 100000   | keyframes of every animation track of the render together, every repeat copy counted, in a frame too                                      | `too-large`          |

The output size is counted while the SVG is written (a shared definition once, when its first use writes it), and
every layer reserves the least markup of its kind before it is built (a path also its data, a template `d` once
evaluated, a text its filled-in content, before either is measured), so a huge or nested `repeat` stops early instead of building everything. Font
subsets are written once every text is laid out and count like any markup; text drawn as paths checks its path data
against the budget glyph by glyph while it is built.
Animation CSS counts toward `maxOutputBytes` like any markup, and every animated transform reserves its group (a
`draw` its dash attributes) before the layer is built. Opacity and colour tracks write nothing of their own and the CSS
is written only once every track is built, so `maxAnimationKeyframes` bounds that work: each track charges its
keyframes before any is resolved. Fixed limits: 10000 items per `repeat` (expr, `binding` at
`repeat/each`) and 64 levels of nested component instances (`too-large`). Shaping is bounded twice by counts (see Fonts, untrusted fonts):
each text by its own budget, max(16384, 128 x its length) operations, which fails as `asset-format` at the font; and
the whole render by 4000000 shaping operations, every text together (an internal bound like the outline work, not a
`RenderLimits` field), which fails as `asset-too-large` at the content of the text that crossed it, naming its font.
A text laid out once is shaped once, however many copies draw it.
The JPEG symbol check (see Images) is bounded by fixed limits, not `RenderLimits` fields. Per file, each an
`asset-format` naming it: 134217728 (2^27) decoding steps (a block or MCU visited, a run of empty bands in a first AC
scan counting once), and a progressive frame of at most 8388608 (2^23) blocks over all its components, whose nonzero
history and column-pair sums (128 MiB at most) are checked before any is allocated; both stay far above a 4 MiB file of the largest image the
raster output takes. Per render, every image asset together (each asset is checked, even one whose bytes another
asset shares): the same 134217728 steps (`maxRenderEntropySteps`, like the shaping bound), so copies of a crafted file
cost no more than the costliest single one (a 10 KB progressive file can take some 7 million steps); crossing it fails
as `asset-too-large` at the image asset that crossed it, naming the limit. A JPEG whose result is cached (see Images)
charges the steps its first check took, and one the budget no longer holds fails as that check would have, so the
same design fails at the same asset with the same issue, and renders the same SVG, whatever was checked before. Raster
export checks the images of its SVG again against a budget of its own of that size (`raster-too-many-image-pixels`),
charged alike, the images the render checked found in the cache.

## Issues

| code                   | meaning                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `binding`              | an expression failed to compile or evaluate, the step budget ran out, a repeat `each` is not a list or has more than 10000 items, or its `as`/`index` names are unreadable or equal (the message names expr's error code)                                 |
| `type`                 | a value of the wrong kind (also a prop of the wrong type, a list or object written into text)                                                                                                                                                             |
| `range`                | a number outside the format's range, a keyframe offset below the one before it, a `time` outside [0, 86400000], a template `d` that gives empty, over-long (100000) or non-path data (at `d`), an arc a template `d` gives under `draw` (at the track)    |
| `missing-asset`        | an asset path or an image `src` bound to data (`{{binding}}`) without supplied bytes, or a reference to no asset                                                                                                                                          |
| `asset-format`         | not an accepted image or a malformed font (also one found broken when its glyphs, layout tables or subset are read, one whose layout tables pass a shaping cap, or a table that decompresses past its declared size); a data URI type that does not match |
| `asset-too-large`      | over a byte, side or frame limit; a font past its outline budget or whose subset could not fit the output budget; a text that brings the render past its shaping bound (at the text)                                                                      |
| `unsupported-font`     | a font collection (TTC, or WOFF2 with several fonts), CFF2 outlines or a CFF FontMatrix other than 1/unitsPerEm                                                                                                                                           |
| `font-not-embeddable`  | warning: the licence or the fsType forbids embedding; the font's text is drawn as paths (once per asset)                                                                                                                                                  |
| `font-reserved-name`   | warning: the font has a Reserved Font Name (declared, or stated in its name table), so no subset may be embedded; its text is drawn as paths (once per asset, at what decided)                                                                            |
| `too-large`            | the SVG passes `maxOutputBytes`, a text passes `maxTextLength`, the repeats pass `maxRepeatCopies` (at the `repeat` that crossed it), the tracks pass `maxAnimationKeyframes` (at the track that crossed it), components nest deeper than 64 levels       |
| `font-family-mismatch` | warning: the asset family differs from the family inside the font                                                                                                                                                                                         |
| `missing-glyph`        | warning: characters neither the font nor its fallbacks have; they are not drawn and take no space (once per font asset, up to ten named)                                                                                                                  |
| `animation-cut`        | warning: a track runs past the end of the timeline and is cut there (once per track, however many copies)                                                                                                                                                 |

## Report

A successful render reports `bytes` (UTF-8 size of the SVG), `limit` (the `maxOutputBytes` used) and, in first-use
order, `fonts` and `images`: the bytes each asset adds to the SVG. A font is `{ asset, bytes, glyphs, drawnAs }`,
listed when it draws at least one glyph: `bytes` is the data URI of its subset plus the path data of text drawn with
it as paths, `glyphs` the distinct glyphs it draws, `drawnAs` `font` when a subset is embedded, else `paths`; the
subset's size grows with distinct glyphs, not with repeats. An image is `{ asset, bytes }`. The data of an image counts
once however often it is drawn (an image with EXIF data, inline at every use, once per use), and 0 for an asset whose
inlined copy an earlier asset already wrote (the copy, not the asset's own bytes: two assets that differ only by
their colour profile write one image), so the image bytes add up to what the SVG holds. A design with a timeline also reports `animation: { duration, loop }`, what `frameTimes`
takes.

With the option `layerBoxes: true` a successful render also returns `layerBoxes`, one per drawn node in paint order
(later boxes are drawn over earlier ones): `{ layer, x, y, width, height, rotation?, groupTurns? }`. `layer` is the JSON
Pointer of the design layer under `/layers` that drew it: every repeat copy gives its layer's pointer, the layers of a
component give their instance's. `x`, `y`, `width`, `height` are the node's box at its layout position before any turn
(its offsets and those of its groups added; animations do not move it), rounded to 3 decimals. On the canvas the box is
turned by `rotation` (its own degrees, clockwise about its centre), then by each of `groupTurns` (`{ degrees, cx, cy }`,
the turned groups around it, innermost first, each about a centre in the same unturned coordinates); either is absent
when nothing turns. The renderer does no trigonometry here, as in the SVG: the reader applies the turns. Layers a
`visible` or `if` drops have no box. The option never changes the SVG or the report; the editor selects layers in its
preview with it.
