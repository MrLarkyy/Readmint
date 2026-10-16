# Design format v0

A design is a JSON or YAML document describing a canvas and its layers. It is the public contract between the editor,
the renderer, the Action and the templates: built-in visuals are designs in this format too. `@readmint/format` reads,
migrates and validates it; the published JSON Schema gives editors completion and inline errors.

```json
{
  "$schema": "https://raw.githubusercontent.com/MrLarkyy/Readmint/main/packages/format/schema/design-v0.schema.json",
  "version": 0,
  "canvas": { "width": 400, "height": 120, "background": "#0d1117" },
  "assets": {
    "fonts": {
      "inter": {
        "family": "Inter",
        "src": "fonts/Inter-Regular.ttf",
        "licence": { "embedding": "allowed", "name": "OFL-1.1" }
      }
    }
  },
  "layers": [
    { "type": "text", "x": 16, "y": 32, "content": "Hello, {{github.name}}", "font": "inter" }
  ]
}
```

## API

```ts
import {
  parseDesign,
  parseDesignAsync,
  parseDesignSourceAsync,
  stringifyDesignYamlAsync,
  validateDesign,
  migrateDesign,
  designJsonSchema,
  quoteInput,
} from "@readmint/format";

parseDesign(source, { format?: "json" | "yaml" }); // text -> parse -> migrate -> validate
await parseDesignAsync(source, { format? }); // the same, the YAML parser loaded on first use
await parseDesignSourceAsync(source, format?); // text -> plain value only
await stringifyDesignYamlAsync(design); // a design -> YAML text, the YAML library loaded on first use
validateDesign(value); // already parsed (editor state): migrate -> validate
migrateDesign(value, { migrations?, target? }); // only the migration chain
quoteInput(value, { maxEcho?, escape? }); // an input value as issue messages quote it
```

`quoteInput` is how every issue message quotes a value from the input: JSON-quoted, clipped at `maxEcho` code points
(default `DesignLimits.maxEcho`, 64) with an ellipsis, and every code point `escape` selects written as `\uXXXX`, one per
UTF-16 unit. The default escape set is the engine-independent one of the format (C0 and C1 controls, bidi marks,
embeddings, overrides and isolates, line and paragraph separators); a host may pass a wider one (the CLI does).

`parseDesignAsync` gives the same results as `parseDesign`; `parseDesignSourceAsync` is the parse step alone (text to a
plain value, no migration or validation; its synchronous form is internal). They load the YAML
parser with a dynamic import only when the source is YAML, so a browser bundle (the editor) keeps it out of its initial
chunk; the package is marked `sideEffects: false` for that. `parseDesign` stays for callers that want no async step.

`stringifyDesignYamlAsync` writes a design as YAML 1.2 (core schema) in the design's own key order, without anchors or
line folding, so `parseDesignAsync` reads it back to a deep-equal design and the same design gives the same text. A
text longer than `DesignLimits.maxYamlSourceLength` is refused with a `too-large` issue naming both lengths (the reader
would refuse it); JSON has no such limit below `maxSourceLength`.

Every function returns a `DesignResult`:

```ts
type DesignResult<T> =
  | { ok: true; value: T; migratedFrom?: number }
  | { ok: false; issues: DesignIssue[]; truncated: boolean };
```

`validateDesign` returns the caller's object itself when no migration ran and never changes it. Without `format`, a
source whose first non-whitespace character is `{` is read as JSON, anything else as YAML (pass `format: "yaml"` for a
YAML document written in flow style). A leading byte order mark is ignored.

Validation runs in this order and stops at the first stage with issues: source limits and syntax, value bounds
(depth, size), version and migration, structure (the JSON Schema rules), references.

## Values used below

| name     | accepted                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------- |
| id       | `^[A-Za-z][A-Za-z0-9_-]{0,63}$`: layer ids, style, asset, component and prop names                        |
| binding  | a string starting with `{{` and ending with `}}`, at most 2048 characters ([expressions](expressions.md)) |
| colour   | `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`                                                                 |
| paint    | a colour, `"none"`, a binding or a gradient                                                               |
| position | a number in [-100000, 100000]                                                                             |
| size     | a number in (0, 100000]                                                                                   |
| length   | a number in [0, 100000]                                                                                   |
| unit     | a number in [0, 1]                                                                                        |
| `B<x>`   | bindable: the literal `x` or a binding                                                                    |

Every numeric, colour and boolean property of the canvas, layers, styles, layouts and gradients is bindable, and so are
keyframe values and track timing (`duration`, `delay`, `stagger`); asset and component-definition metadata, the
timeline (`animation`), keyframe `offset`s and easings take literals only. Numbers must be finite: YAML `.inf` and `.nan` are rejected. Bindings are opaque here; the expression language
(`@readmint/expr`, [docs/expressions.md](expressions.md)) evaluates them, and the renderer checks the evaluated values
against the same ranges (`ValueRanges` from `@readmint/format`, which the schema is built from). A binding that is exactly
one `{{ }}` placeholder keeps the type of its value (`"{{ count }}"` is a number); any other string, such as
`"{{ a }} x {{ b }}"`, evaluates to a string, so a numeric, colour or boolean property, `if` and `repeat.each` should be
one placeholder.

## Document

| property      | required | type                                           | notes                                                                        |
| ------------- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `$schema`     |          | string, at most 512                            | editor hint, ignored                                                         |
| `version`     | yes      | the integer `0`                                | see [Versioning](#versioning)                                                |
| `title`       |          | string, at most 200                            | accessible title of the output                                               |
| `description` |          | string, at most 2000                           | accessible description of the output                                         |
| `locale`      |          | `en`, `de`, `fr`, `es` or `cs`                 | locale of the number and date filters, see [Locales](expressions.md#locales) |
| `canvas`      | yes      | canvas                                         |                                                                              |
| `layers`      | yes      | array of layers                                | drawn in order, first at the back                                            |
| `styles`      |          | object: id -> style                            | shared by layers through `style`                                             |
| `assets`      |          | `{ fonts?: id -> font, images?: id -> image }` |                                                                              |
| `components`  |          | object: id -> component definition             | reusable layer groups                                                        |
| `animation`   |          | `{ duration, loop? }`                          | the timeline, see [Animation](#animation)                                    |

**canvas**: `width`, `height` (required, `B<integer 1..4096>`; 4096 is the PNG cap of the raster path),
`background` (paint).

**style**: `fill`, `stroke` (paint), `strokeWidth` (`B<0..1000>`), `opacity` (`B<unit>`), `font` (id of a font asset),
`fontSize` (`B<(0, 1000]>`), `fontWeight` (`B<integer 1..1000>`), `lineHeight` (`B<(0, 10]>`), `letterSpacing`
(`B<-100..100>`), `align` (`start` | `middle` | `end`). All optional.

**gradient**: `{ "type": "linear", x1?, y1?, x2?, y2?, stops }` or `{ "type": "radial", cx?, cy?, r?, stops }`;
coordinates are `B<unit>` of the painted box; `stops` holds 2 to 32 `{ offset: B<unit>, color: B<colour> }`.

## Layers

Every layer has `type` (required) and these optional properties:

| property   | type                                     | notes                                                    |
| ---------- | ---------------------------------------- | -------------------------------------------------------- |
| `id`       | id                                       | unique within the document, and within each component    |
| `name`     | string, at most 128                      | label in the editor                                      |
| `x`, `y`   | `B<position>`                            |                                                          |
| `opacity`  | `B<unit>`                                |                                                          |
| `rotation` | `B<-360..360>`                           | degrees                                                  |
| `visible`  | `B<boolean>`                             |                                                          |
| `style`    | id of a style                            | own properties win over the style                        |
| `if`       | binding                                  | the layer is drawn only when it evaluates to true        |
| `repeat`   | `{ each: binding, as?: id, index?: id }` | one copy per item of `each`, exposed as `as` and `index` |
| `animate`  | property -> track                        | see [Animation](#animation); needs `animation`           |

| `type`      | required                                    | optional                                                                                                     |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `group`     | `children` (layers)                         | `width`, `height` (`B<size>`), `clip` (`B<boolean>`), `layout`                                               |
| `rect`      | `width`, `height` (`B<size>`)               | `radius` (`B<length>`), `fill`, `stroke` (paint), `strokeWidth` (`B<0..1000>`)                               |
| `ellipse`   | `width`, `height` (`B<size>`)               | `fill`, `stroke`, `strokeWidth`                                                                              |
| `path`      | `d`                                         | `fill`, `stroke`, `strokeWidth`                                                                              |
| `text`      | `content`                                   | `width` (`B<size>`, wraps), `fill`, `font`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `align` |
| `image`     | `asset` (id), `width`, `height` (`B<size>`) | `fit` (`contain` \| `cover` \| `fill`), `alt` (string, at most 500)                                          |
| `component` | `ref` (id of a component)                   | `width`, `height` (`B<size>`), `props` (prop name -> string, number, boolean or binding)                     |

- `layout` of a group: `{ "type": "absolute" }` (the default: children use their own `x`/`y`),
  `{ "type": "stack", "direction": "row" | "column", gap?: B<length>, align?: "start" | "center" | "end" }` or
  `{ "type": "grid", "columns": B<integer 1..1000>, gap?: B<length> }`.
- `d` of a path: SVG path data of at most 100000 characters, made only of path commands, digits, `e`/`E`, `.`, `,`,
  `+`, `-` and whitespace; or a template of at most 10000 characters with `{{...}}` placeholders between such
  characters (`"M0 {{ 24 - props.height }} h8 V24 h-8 Z"`), so a shape can follow the data. A placeholder here ends at
  its first `}}`. The renderer writes the placeholders in as text
  ([expressions](expressions.md#placeholders-and-text)) and holds the result to the same rules: empty, longer than
  100000 characters or with any other character is a `range` issue at `d` and nothing is drawn. A `d` that is exactly
  one placeholder (`"{{ shape }}"`) takes a data string whole, so its length is checked only there; text built from
  several placeholders stops earlier, at the 100000 characters an expression may produce (`binding`).
- `content` of a text: at most 10000 characters; `{{...}}` placeholders may appear anywhere in it and are written into
  the text ([expressions](expressions.md#placeholders-and-text)).
- A text needs a font: its own `font` or one from its `style`.

## Assets

**font**: `family` (required, 1..128 characters), `src` (required), `weight` (integer 1..1000), `style` (`normal` |
`italic`), `licence` (required): `{ embedding: "allowed" | "restricted", name?: SPDX identifier such as "OFL-1.1",
reservedFontName?: boolean }`, and the optional

- `drawAs`: `"font"` (default) embeds a subset of the glyphs the design draws; `"paths"` draws every text that uses
  the font as path data and embeds nothing;
- `fallback`: 1 to 8 font asset ids, each once, tried in order for a character the font does not have (a space variant or U+2011 the font lacks is drawn from the
  font's own space or hyphen glyph, not from a fallback, unless the font has no U+0020 (or, for U+2011, neither U+2010 nor U+002D), when a fallback font draws it; not
  transitive: a fallback's own `fallback` is not used); an id that names no font asset is `unknown-reference`, a
  repeated one `duplicate-id`;
- `kerning`: `false` turns the font's pair kerning off (default `true`).

The licence is declared by the author. The renderer applies the stricter of this flag and the OS/2 `fsType` of the font
file: a font that may not be embedded is never embedded, whatever `drawAs` says; its text is drawn as paths and the
render warns `font-not-embeddable`. A font with a Reserved Font Name (SIL Open Font License) is never embedded either:
an embedded subset is a Modified Version, which may not use that name, so its text is drawn as paths with the warning
`font-reserved-name`. `licence.reservedFontName` decides when set (`true`: it has one; `false`: embed anyway, e.g.
with written permission), else an SPDX `name` of `OFL-1.0-RFN` / `OFL-1.1-RFN` (has one) or `OFL-1.0-no-RFN` /
`OFL-1.1-no-RFN` (has none), else the renderer reads the font's name table (a copyright or licence record saying
"with Reserved Font Name ..." followed by a name). TrueType, OpenType (CFF), WOFF and WOFF2 are read. How fonts, images
and layouts render: [renderer.md](renderer.md).

**image**: `src` (required), `width`, `height` (intrinsic size, `(0, 100000]`).

**Asset sources** are either

- a relative path: no scheme, no leading `/`, no `\`, no `..` segment, no `:`, `?`, `#` or `%`, at most 1024 characters,
  ending in `.ttf`, `.otf`, `.woff` or `.woff2` (fonts) or `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp` (images), in any
  letter case; resolved against the design file by the CLI and the Action; or
- a base64 data URI: `data:font/ttf|otf|woff|woff2;base64,...` or `data:image/png|jpeg|gif|webp;base64,...`; or
- for an image only, a `{{binding}}` such as `"{{ github.avatarUrl }}"`, evaluated against the root of the render data
  (never a repeat item, so every copy of a repeated layer shows the same image). It must give an https URL on an
  allowed host; the CLI (`--fetch-images`) and the Action fetch it before the render and inline the bytes like a file
  asset's, the renderer never fetches. Without supplied bytes the render fails `missing-asset`. A font `src` binding
  is invalid. The fetch rules: [asset-loading.md](asset-loading.md#images-bound-from-data).

A literal `http(s):` or `file:` URL is rejected, because the output must not reference anything outside itself, and so are SVG
images, because an inlined SVG can carry scripts or external references. The bytes behind a source are checked (size,
format sniffing) when they are loaded, not here. A relative path accepted here can still be refused when it is loaded,
for example for a Windows device name (`CON.png`), a segment ending in a dot or space, or a symlink leaving the design's
folder: see [asset-loading.md](asset-loading.md).

## Components

A component definition is `{ description?, width?, height?, props?, layers }` (`width`/`height` are literal sizes).
`props` maps a prop name to `{ type: "string" | "number" | "boolean" | "color", required?: boolean, default? }`, to
`{ type: "enum", values, required?, default? }` or to `{ type: "array", required?, default? }`.
Component layers read their props as bindings (`{{props.label}}`). The props of a root instance can also come from a settings file passed to the CLI or the Action, which is not part of the format ([cli.md](cli.md#settings-file)).

An `enum` prop takes a string that is one of `values` (1 to 64 strings of 1 to 128 characters); a `default` not listed
is an `enum` issue at `.../default`. An `array` prop takes a list: a literal list of at most 1000 strings, numbers or
booleans (more is `count`, an object item is `type`), or a binding yielding any array, for example a list of data
objects. A `repeat: { each: "{{ props.days }}" }` in the component iterates it, under the usual repeat limits. The items of a literal list are not evaluated (`["{{ user.login }}"]` holds the braces
as text). A prop `default` is a literal value, never evaluated: a binding-shaped default of an `enum`, `array`, `number`
or `boolean` prop is an issue (`enum` or `type` at `.../default`), and the braces in a `string` or `color` default are
literal text.

A `component` layer must reference an existing component, may set only declared props, must set every required one,
and each value must match the declared type (a `color` is a colour) unless it is a binding; a literal value an `enum`
prop does not list is an `enum` issue at the prop. Components may use other
components but never themselves, directly or through others.

## Animation

A design has at most one timeline; layers animate on it through `animate`.

```json
{
  "animation": { "duration": 1500 },
  "layers": [
    {
      "type": "rect",
      "width": 12,
      "height": 12,
      "fill": "{{item}}",
      "repeat": { "each": "{{cells}}" },
      "animate": {
        "opacity": {
          "keyframes": [
            { "offset": 0, "value": 0 },
            { "offset": 1, "value": 1 }
          ],
          "duration": 300,
          "stagger": 40
        },
        "scale": {
          "keyframes": [
            { "offset": 0, "value": 0.3, "easing": "ease-out" },
            { "offset": 1, "value": 1 }
          ],
          "duration": 300,
          "stagger": 40
        }
      }
    }
  ]
}
```

**animation** (root): `duration` (required, an integer number of milliseconds in 1..60000), `loop` (boolean, default
`true`). Both are literals.

**animate** (any layer): an object from property to track. Every layer kind takes `opacity`, `x`, `y`, `scale` and
`rotation`; `rect`, `ellipse` and `path` also `fill` and `stroke`; `text` also `fill`; `path` also `draw`. Any other key
is `unknown-property`; a key twice is `duplicate-key`. A layer with `animate` in a design without `animation` fails with
`missing-property` at `/animation`.

| property   | keyframe value          | meaning                                                                    |
| ---------- | ----------------------- | -------------------------------------------------------------------------- |
| `opacity`  | `B<unit>`               | replaces the layer's opacity                                               |
| `fill`     | `B<colour>`             | replaces the fill (a gradient too); alpha animates `fill-opacity`          |
| `stroke`   | `B<colour>`             | replaces the stroke, like `fill`                                           |
| `draw`     | `B<unit>`               | the drawn share of the stroke; the path data has no arcs (see below)       |
| `x`, `y`   | `B<position>`           | moves the layer by this much on top of its layout                          |
| `scale`    | `B<-100..100>`          | scales the layer around the centre of its box                              |
| `rotation` | `B<-360..360>`, degrees | turns the layer around the centre of its box, on top of its own `rotation` |

Animation never changes the layout: a stack or grid places the layer as if it did not move.

**track**: `keyframes` (required, 2 to 32 `{ offset, value, easing? }`), `duration` (`B<integer 1..60000>` ms, default
the timeline's), `delay` and `stagger` (`B<integer 0..60000>` ms, default 0), `easing` (default `linear`).

- `offset` is a literal unit: the share of the track's `duration` at which the keyframe's value is reached. Offsets
  never decrease (a decreasing one is `range` at that offset); two equal offsets make a jump. Before its first keyframe
  a track holds the first value, after its last one the last value.
- A track starts at `delay + stagger x index`, where `index` is the copy's position in the layer's own `repeat` (0
  without one). Nested repeats, such as weeks and days of a calendar, bind the delay instead:
  `"delay": "{{ (week * 7 + day) * 8 }}"` with `index: "week"` and `index: "day"` on the two repeats.
- A track that runs past the end of the timeline is cut there: its last keyframe becomes the value it has at that
  moment, and the render warns `animation-cut` once per track. Copy counts come from data, so this is a warning, not a
  failure. The segment before the cut keeps its easing, played over the shorter span up to the end.
- `draw` with several subpaths (each `M`, and the segment after a `Z`): every subpath draws from its own start, all at
  the pace of the longest one, which is complete at `1`; shorter subpaths are complete earlier.
- `easing` from one keyframe to the next: the keyframe's own `easing`, else the track's. It is `linear`, `ease`,
  `ease-in`, `ease-out`, `ease-in-out` (the CSS curves) or `{ x1, y1, x2, y2 }`, a CSS `cubic-bezier` with `x1`, `x2` in
  [0, 1] and `y1`, `y2` in [-10, 10]; outside [0, 1] the value overshoots its keyframes (opacity and colours are clamped).
- `draw` needs path data without `A`/`a` commands (`pattern` at `.../animate/draw`): an arc's exact length needs
  trigonometry, which the renderer never uses ([renderer.md](renderer.md#animation)). In a template `d` the text
  outside the placeholders is checked here; an arc the placeholders give is a `range` issue at the track when rendering.

How the timeline becomes CSS animation and static frames: [renderer.md](renderer.md#animation).

## Limits

| limit         | value                                                         | issue code        |
| ------------- | ------------------------------------------------------------- | ----------------- |
| source length | 4194304 UTF-16 code units, checked before parsing             | `too-large`       |
| YAML length   | 1048576 UTF-16 code units for a YAML source, before parsing   | `too-large`       |
| nesting       | 64 levels of objects and arrays (the root object is level 1)  | `too-deep`        |
| values        | 1000000 values visited; a reused YAML alias counts each time  | `too-large`       |
| layers        | 10000, counting each component instance with all its layers   | `too-many-layers` |
| YAML aliases  | 100 alias nodes in the source, counted before any is resolved | `too-large`       |
| issues        | 100 per result, then `truncated: true`                        |                   |

YAML nesting is checked on the syntax tree before the document is built, so a too-deep YAML source fails at its first
collection past the limit, with line and column, the same on every call. Code reading a design file should also cap its
size in bytes before decoding it.

## Issues

```ts
interface DesignIssue {
  path: string; // RFC 6901 JSON Pointer, "" is the root
  code: DesignIssueCode;
  message: string;
  line?: number; // 1-based, on issues found while parsing the text
  column?: number; // 1-based, UTF-16 code units
}
```

```json
[
  {
    "path": "/layers/0/fill",
    "code": "pattern",
    "message": "\"#ggg\" is not a colour (#rgb, #rgba, #rrggbb or #rrggbbaa), \"none\", a {{binding}} or a gradient"
  },
  {
    "path": "/layers/1/children",
    "code": "missing-property",
    "message": "missing required property \"children\""
  },
  {
    "path": "",
    "code": "duplicate-key",
    "message": "duplicate key \"version\"",
    "line": 2,
    "column": 2
  }
]
```

- Issues come in document order and in the same order on every run and engine.
- A missing property is reported at the path it would have (`/canvas`, `/layers/1/children`, `/version`).
- Parse issues have the root path and carry `line` and `column`.
- A message quotes at most 64 characters of an input value, JSON-escaped. A property name longer than 64 characters or
  holding control, bidi or line-separator characters is never put into a path: the issue is reported at its parent.

| code                  | meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `parse`               | invalid JSON or YAML syntax, an unknown YAML tag, several YAML documents                              |
| `duplicate-key`       | the same key twice in one object                                                                      |
| `too-large`           | source too long, too many values or YAML aliases                                                      |
| `too-deep`            | nesting over the limit (also a reference cycle in an editor object)                                   |
| `unsupported-version` | `version` newer than this reader, or negative                                                         |
| `migration-missing`   | no migration step from the document's version                                                         |
| `missing-property`    | a required property is absent (`animation` when a layer has `animate`)                                |
| `unknown-property`    | a property the format does not define, or a prop the component does not declare                       |
| `type`                | wrong kind of value (string instead of number, not finite, not an integer)                            |
| `enum`                | not one of the allowed words, including an unknown layer `type` or a value an enum prop does not list |
| `pattern`             | a string in the wrong shape (colour, id, asset source, path data, arcs in `draw`)                     |
| `range`               | a number outside its range, or a keyframe offset below the one before it                              |
| `length`              | a string too long or empty                                                                            |
| `count`               | an array (a prop list too) with too few or too many items                                             |
| `duplicate-id`        | a layer id used twice in one scope                                                                    |
| `unknown-reference`   | `style`, `font`, `asset` or `ref` names nothing in the document                                       |
| `component-cycle`     | components that contain themselves; reported at the `ref` closing the loop                            |
| `missing-font`        | a text with neither `font` nor a style with a font                                                    |
| `too-many-layers`     | the document expands to more than 10000 layers                                                        |

## YAML

YAML is read as YAML 1.2 with the core schema: `yes`, `no`, `on` and `off` stay strings, `012` is the number 12. Merge
keys (`<<`) are ordinary keys and therefore unknown properties. Anchors and aliases work within the alias and value limits; an alias must follow its anchor, otherwise it is a `parse` issue
with line and column. Tags
other than the core ones (`!!str`, `!!int`, `!!float`, `!!bool`, `!!null`, `!!map`, `!!seq`) are rejected, keys must be
plain scalars, and a stream must hold exactly one document. The same document as JSON and as YAML gives deep-equal
results.

## JSON Schema

The schema is generated from the same definition the validator runs, so they cannot disagree on structure:

- file `packages/format/schema/design-v0.schema.json`, package export `@readmint/format/schema/design-v0.schema.json`,
  object `designJsonSchema` from `@readmint/format`;
- JSON Schema 2020-12, `$id`
  `https://raw.githubusercontent.com/MrLarkyy/Readmint/main/packages/format/schema/design-v0.schema.json`;
- every object rejects unknown properties (`additionalProperties: false`).

Put that URL in `$schema` for editor support. The schema covers structure; references, unique ids, component props and
cycles, fonts on text and the limits are checked only by `@readmint/format`. Regenerate the file with
`pnpm schema:update` after changing the definition (`packages/format/src/designSchemaV0.ts`); a test fails while the
committed file differs from the emitted schema, and the file is excluded from Prettier.

## Versioning

- `version` is an integer; this package reads version `0` (`DESIGN_FORMAT_VERSION`).
- While the format is v0, adding an optional property or a new layer kind keeps `version: 0`.
- Removing or renaming a property, or changing what a value means, increases `version` by one and ships a
  `DesignMigration { from, to: from + 1, migrate }` together with a test migrating an old document.
- Migrations run as a contiguous chain on a deep copy of the document; the caller's object is never changed and the
  result reports `migratedFrom`.
- A document newer than the reader fails with `unsupported-version`; it is never partially rendered.
- Each released version keeps its schema file (`design-v<N>.schema.json`).

The animation section (`animation`, `animate`), the font asset options `drawAs`, `fallback` and `kerning` and the
font licence option `reservedFontName` were added to v0 as optional properties, so no design needs migrating.
Rendering an existing design changed with them, though, without a version step (the meaning of the document is the same; the renderer draws it more faithfully):
glyphs are kerned by default (`kerning: false` restores the unkerned positions), so text without the new options is
placed slightly differently; a font whose licence or fsType forbids embedding is drawn as paths with the warning
`font-not-embeddable` instead of failing the render; a text gradient spans the text's layout box instead of the ink
of its glyphs. Text shaping (RM-44) changed rendering again without a version step: fonts with ligature, composition
or mark features draw standard ligatures and attach combining marks, right-to-left text is reordered by the Unicode
Bidirectional Algorithm, `align` start and end follow each paragraph's direction (the right edge is the start of a
right-to-left paragraph), and font-mode text may hold private-use characters with an `aria-label`. Plain text keeps its exact positions only where the font does nothing but pair kerning to it: contextual alternates (`calt`, e.g. a font that changes the colon in 12:30), `ccmp` or `locl` substitutions of plain Latin, contextual kerning (GPOS 7/8), non-Latin text now kerned under its own script tag, and the lost pair kerning across a script change (two runs) all move or change plain text too. See [renderer.md](renderer.md#text).
The Reserved Font Name policy (RM-45) changed rendering without a version step too: a font with a Reserved Font Name
(declared, or stated in its name table) that used to be embedded as a subset is drawn as paths with the warning
`font-reserved-name`; `licence.reservedFontName: false` embeds it as before.
The grammar inside bindings is
the expression language v0 of `@readmint/expr`, described in [docs/expressions.md](expressions.md).
