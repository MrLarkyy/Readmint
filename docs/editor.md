# Editor

`@readmint/editor` is the visual editor: a browser app that edits a [design file](design-format.md) and previews it
with the same renderer the CLI and the Action use, so the preview is the output.

## Run and build

```sh
pnpm editor                              # dev server (Vite) of packages/editor
pnpm --filter @readmint/editor app       # static app in packages/editor/dist-app/
```

The app is built from the workspace sources; CI builds it on every change. It has no runtime dependency outside the
workspace and no UI framework: the DOM views are small classes that dispatch commands.

## What can be edited

- **Canvas**: width, height, background (no layer selected).
- **Layers**: add a rect, ellipse, text or group (into the selected group, else at the top level); select in the canvas
  or the layer tree; move by dragging; resize by the corner handles; reorder and remove in the layer tree. A new
  design is an empty canvas: nothing is predefined.
- **Properties**: the fields of the selected layer's type, as the design format defines them. A number field takes a
  number or a `{{binding}}`; a paint takes `#rrggbb`, `none`, a binding or a gradient as JSON; a text's `content` may
  hold placeholders. An invalid value is refused with the format's issue; the design is unchanged.
- **Fonts**: upload a TTF, OTF, WOFF or WOFF2 file (see below).
- **Fixture data**: load a JSON file of data namespaces, as the CLI's `--data` file; bindings render against it.
- **Import and export**: import a JSON or YAML design file (validated with the format's limits); export the design as
  `design.json` (two-space JSON, a final line feed, the same bytes for the same design). The export re-imports to the
  same design.

Not in this version: undo, animation editing (animated designs import and preview, their timeline is not edited),
image upload, YAML export, raster export.

Dragging writes whole numbers. It never changes a coordinate or size bound to data, nor the place of a layer a stack
or grid layout positions (its `x`/`y` are offsets in its slot; the property panel says so): such a drag is refused with
an issue. A path keeps its size (its data is its shape); a text's handles set its wrapping `width`. In a turned group a
drag is turned back into the group's coordinates, so the layer follows the pointer. Resize handles appear only on a
layer that neither it nor any group around it turns (whole turns aside): turns that cancel out on the canvas still swap
what the layer calls width and height.

## Preview

Every change re-renders with `renderPreview`, which is `renderSvg(design, { data, assets, layerBoxes: true })` and
nothing more. It runs in a module Web Worker: a hostile design can keep only the worker busy, and a render running
longer than `EditorLimits.renderTimeoutMs` (10 s) is stopped (the worker is replaced) and reported. A worker that fails
(an error, a result it cannot send) is reported at once and replaced for the next render. A newer edit's render always
wins: an older result arriving later is dropped.

The SVG is shown as an `<img>` of its exact bytes (a blob URL), as the CLI preview and a README show it: its ids and
styles never meet the page or another copy, and it runs no script. The editor draws its own selection overlay from
the renderer's `layerBoxes` ([renderer.md](renderer.md#report)), which never change the SVG. The render's issues and
warnings are listed under the editor with their design pointer; one inside a layer selects it when clicked. After a
render fails, the image keeps showing the last good render, but clicking the canvas selects nothing until a render
succeeds (the layer tree still does): the old boxes may no longer match the design.

Exporting the design and rendering it with `readmint render design.json --data <fixture>` gives the preview's bytes;
a golden suite (`packages/editor/test/editor-session.golden.ts`, Node and Chromium) and a CLI test pin it.

## Fonts and licences

An uploaded font becomes a font asset whose `src` is a base64 `data:` URI, so the design file carries it. Family,
weight and style come from the font (the file name when it names no family); the asset id is made from the file name.

- The file is refused before it is parsed when it is larger than `EditorLimits.maxFontBytes` (the renderer's
  `maxFontBytes`, 4 MiB); a malformed, unsupported (collection) or over-large font is refused with the parser's
  reason. A font that would make the exported file longer than `DesignLimits.maxSourceLength` (what the CLI reads) is
  refused, naming both lengths, as is every other edit that would. A refused font leaves the design unchanged.
- A font whose OS/2 fsType forbids embedding is stored with `licence.embedding: "restricted"`: its text is drawn as
  paths and the font is never embedded. Its embedding control is disabled with the reason, and the command refuses to
  set it to `allowed`; this holds for fonts of imported designs too (their data URIs are read again). Any font may be
  set to restricted. The licence name (SPDX) is editable. Any asset id the format allows works, `constructor` included.
- Reading the fonts of an imported design is bounded as in the renderer: each distinct source is decoded once, and
  together they may decode to `EditorLimits.maxTotalFontBytes` (the renderer's `maxTotalFontBytes`, 16 MiB), charged by
  declared size before anything inflates. The font that crosses it stops the check with an issue; the fonts from it on
  are not locked in the panel, and the renderer still never embeds a font whose fsType forbids it.

## Assets given by path

An imported design may name font or image files by path. The asset panel lists them as needing a file; a file picked
there is used by the preview for this session only (same size limits, checked before the file is read) and never
written into the design, which keeps
the path, so the CLI reads the same file next to the design. Image URLs bound to data are not fetched: the editor makes
no network request at all, and it never handles a token. The renderer's `missing-asset` issue is shown instead.

## Limits

`EditorLimits`: `maxFixtureBytes` 8 MiB (the CLI's), `maxFontBytes` and `maxImageBytes` 4 MiB and
`maxTotalFontBytes` 16 MiB (the renderer's), `renderTimeoutMs` 10 000. Every file the user picks is size-checked before
it is read. Design files are bounded by `DesignLimits` on import and on every edit: an edit that would make the exported
file longer than `maxSourceLength` is refused.

## Content Security Policy

The app's page sets `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' blob:
data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`: only the app's own
scripts, worker and stylesheet load, nothing inline runs, and the page makes no request (the dev server alone allows
`connect-src 'self'` for its reload socket). A test builds the app and drives it in Chromium under this policy.

## Bundle

The initial chunk holds the editor and the format's validation (about 20 kB gzip, budget 120 kB). The YAML parser and
the font parser load on first use; the renderer lives only in the preview worker (budget 250 kB gzip). A test bundles
the app and checks both budgets and which chunk holds what.

## API

```ts
import {
  mountEditor,
  renderPreview,
  exportDesign,
  uploadFont,
  EditorLimits,
} from "@readmint/editor";

const editor = mountEditor(document.getElementById("app")!, {
  initial: design, // optional, default an empty canvas
  save: ({ name, text }) => store(name, text), // optional, default a download
});
editor.dispatch((state) => moveLayer(state, "/layers/0", 10, 0));
```

The state (`EditorState`: design, selection, fixture data, session assets, font checks, issues) is immutable; every
command (`addLayer`, `moveLayer`, `resizeLayer`, `setLayerProperty`, `reorderLayer`, `removeLayer`, `selectLayer`,
`uploadFont`, `setFontAsset`, `attachAsset`, `loadFixture`) is a pure function returning a new state whose design
passes `validateDesign`, or the same design with the issues saying why not.
