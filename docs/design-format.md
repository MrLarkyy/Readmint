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
import { parseDesign, validateDesign, migrateDesign, designJsonSchema } from "@readmint/format";

parseDesign(source, { format?: "json" | "yaml" }); // text -> parse -> migrate -> validate
validateDesign(value); // already parsed (editor state): migrate -> validate
migrateDesign(value, { migrations?, target? }); // only the migration chain
```

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

| property      | required | type                                           | notes                                     |
| ------------- | -------- | ---------------------------------------------- | ----------------------------------------- |
| `$schema`     |          | string, at most 512                            | editor hint, ignored                      |
| `version`     | yes      | the integer `0`                                | see [Versioning](#versioning)             |
| `title`       |          | string, at most 200                            | accessible title of the output            |
| `description` |          | string, at most 2000                           | accessible description of the output      |
| `canvas`      | yes      | canvas                                         |                                           |
| `layers`      | yes      | array of layers                                | drawn in order, first at the back         |
| `styles`      |          | object: id -> style                            | shared by layers through `style`          |
| `assets`      |          | `{ fonts?: id -> font, images?: id -> image }` |                                           |
| `components`  |          | object: id -> component definition             | reusable layer groups                     |
| `animation`   |          | `{ duration, loop? }`                          | the timeline, see [Animation](#animation) |

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
  `+`, `-` and whitespace.
- `content` of a text: at most 10000 characters; `{{...}}` placeholders may appear anywhere in it and are written into
  the text ([expressions](expressions.md#placeholders-and-text)).
- A text needs a font: its own `font` or one from its `style`.

## Assets

**font**: `family` (required, 1..128 characters), `src` (required), `weight` (integer 1..1000), `style` (`normal` |
`italic`), `licence` (required): `{ embedding: "allowed" | "restricted", name?: SPDX identifier such as "OFL-1.1" }`.

The licence is declared by the author. The renderer applies the stricter of this flag and the OS/2 `fsType` of the font
file: a font that may not be embedded is never embedded. Until text-to-paths arrives (RM-14) such a font fails the render
with `font-not-embeddable`; the v0 renderer also refuses WOFF and WOFF2 until then (use `.ttf` or `.otf`). How fonts,
images and layouts render: [renderer.md](renderer.md).

**image**: `src` (required), `width`, `height` (intrinsic size, `(0, 100000]`).

**Asset sources** are either

- a relative path: no scheme, no leading `/`, no `\`, no `..` segment, no `:`, `?`, `#` or `%`, at most 1024 characters,
  ending in `.ttf`, `.otf`, `.woff` or `.woff2` (fonts) or `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp` (images), in any
  letter case; resolved against the design file by the CLI and the Action; or
- a base64 data URI: `data:font/ttf|otf|woff|woff2;base64,...` or `data:image/png|jpeg|gif|webp;base64,...`.

`http(s):` and `file:` URLs are rejected, because the output must not reference anything outside itself, and so are SVG
images, because an inlined SVG can carry scripts or external references. The bytes behind a source are checked (size,
format sniffing) when they are loaded, not here. A relative path accepted here can still be refused when it is loaded,
for example for a Windows device name (`CON.png`), a segment ending in a dot or space, or a symlink leaving the design's
folder: see [asset-loading.md](asset-loading.md).

## Components

A component definition is `{ description?, width?, height?, props?, layers }` (`width`/`height` are literal sizes).
`props` maps a prop name to `{ type: "string" | "number" | "boolean" | "color", required?: boolean, default? }`.
Component layers read their props as bindings (`{{props.label}}`).

A `component` layer must reference an existing component, may set only declared props, must set every required one,
and each value must match the declared type (a `color` is a colour) unless it is a binding. Components may use other
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
| `draw`     | `B<unit>`               | the drawn share of the stroke, from its start; the path data has no arcs   |
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
  failure.
- `easing` from one keyframe to the next: the keyframe's own `easing`, else the track's. It is `linear`, `ease`,
  `ease-in`, `ease-out`, `ease-in-out` (the CSS curves) or `{ x1, y1, x2, y2 }`, a CSS `cubic-bezier` with `x1`, `x2` in
  [0, 1] and `y1`, `y2` in [-10, 10]; outside [0, 1] the value overshoots its keyframes (opacity and colours are clamped).
- `draw` needs path data without `A`/`a` commands (`pattern` at `.../animate/draw`): an arc's exact length needs
  trigonometry, which the renderer never uses ([renderer.md](renderer.md#animation)).

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

| code                  | meaning                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `parse`               | invalid JSON or YAML syntax, an unknown YAML tag, several YAML documents          |
| `duplicate-key`       | the same key twice in one object                                                  |
| `too-large`           | source too long, too many values or YAML aliases                                  |
| `too-deep`            | nesting over the limit (also a reference cycle in an editor object)               |
| `unsupported-version` | `version` newer than this reader, or negative                                     |
| `migration-missing`   | no migration step from the document's version                                     |
| `missing-property`    | a required property is absent (`animation` when a layer has `animate`)            |
| `unknown-property`    | a property the format does not define, or a prop the component does not declare   |
| `type`                | wrong kind of value (string instead of number, not finite, not an integer)        |
| `enum`                | not one of the allowed words, including an unknown layer `type`                   |
| `pattern`             | a string in the wrong shape (colour, id, asset source, path data, arcs in `draw`) |
| `range`               | a number outside its range, or a keyframe offset below the one before it          |
| `length`              | a string too long or empty                                                        |
| `count`               | an array with too few or too many items                                           |
| `duplicate-id`        | a layer id used twice in one scope                                                |
| `unknown-reference`   | `style`, `font`, `asset` or `ref` names nothing in the document                   |
| `component-cycle`     | components that contain themselves; reported at the `ref` closing the loop        |
| `missing-font`        | a text with neither `font` nor a style with a font                                |
| `too-many-layers`     | the document expands to more than 10000 layers                                    |

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

The animation section (`animation`, `animate`) was added to v0 as optional properties. The grammar inside bindings is
the expression language v0 of `@readmint/expr`, described in [docs/expressions.md](expressions.md).
