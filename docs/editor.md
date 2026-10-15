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
  `design.json` (two-space JSON, a final line feed, the same bytes for the same design), as `design.yaml` (YAML 1.2,
  keys in the design's own order, no anchors; refused with an `export` issue naming both lengths when it would pass the
  YAML reader's 1 MiB, then export JSON), or as `design.png` / `design.webp` ([below](#raster-export)). A file export
  re-imports to the same design; an image is what the CLI renders.

Not in this version: undo, animation editing (animated designs import and preview, their timeline is not edited),
image upload, APNG or GIF export, and scale, frame rate or quality settings for the raster export.

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

## Raster export

The toolbar's "Export PNG" and "Export WebP" make the image the CLI makes for the same design and fixture data:
`readmint render design.json --data data.json --format png|webp` with its defaults (scale 2, lossless WebP). The export
is `renderSvg(design, { data, assets, time })` for each frame, as the CLI renders it, passed to `exportRaster` of
`@readmint/raster/browser` ([raster.md](raster.md#in-the-browser)): a still design gives a still image, a design with a
timeline an animated WebP (a PNG of its first frame). The files are `design.png` and `design.webp`.

It runs in a module Web Worker started for the export and terminated when it ends: the worker fetches the two
WebAssembly files from the app's own origin, exports, and answers with the bytes. Nothing of raster export is in the
initial chunk or the preview worker; the worker file is loaded only when a button is clicked. One export runs at a time
(a second click is reported as an `export` issue); one running longer than `EditorLimits.rasterTimeoutMs` (120 s) is
stopped and reported, as is a worker that fails. The rasterizer's own limits (`RasterLimits`, as in the CLI) apply, and
a refusal reaches the issue list in its words.

The bytes are pinned: `packages/editor/test/editorRasterParity.ts` holds the SHA-256 of the CLI's PNG and WebP of
test designs made through the editor's commands; Node (the CLI and the export code), Chromium (the export code, and
the mounted editor with its real worker) and the built app (a download from its page) must all match it.

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
  set to restricted. The licence name (SPDX) is editable. An edit changes only the field it names: every other licence
  field (`reservedFontName` included) and asset field is kept. Any asset id the format allows works, `constructor`
  included.
- Reading the fonts of an imported design (or of attached font files) is bounded as in the renderer: each distinct
  source is decoded once, and a font may decode to no more than what is left of `EditorLimits.maxTotalFontBytes` (the
  renderer's `maxTotalFontBytes`, 16 MiB): a WOFF or WOFF2 declaring more is refused before it inflates anything, and a
  font that reads is charged its decoded size. The first font that cannot be read (malformed, unsupported, or past the
  allowance) stops the check with an issue at its pointer, as it stops a render, so a font that fails costs at most its
  own inflate once. The fonts from it on are not locked in the panel, and the renderer still never embeds a font whose
  fsType forbids it. An upload reads one file of at most `maxFontBytes`.

## Assets given by path

An imported design may name font or image files by path. The asset panel lists them as needing a file; a file picked
there is used by the preview for this session only (same size limits, checked before the file is read) and never
written into the design, which keeps
the path, so the CLI reads the same file next to the design. Image URLs bound to data are not fetched: the editor makes
no network request but the raster worker's fetch of its two WebAssembly files from the app's own origin, and it never
handles a token. The renderer's `missing-asset` issue is shown instead.

## Limits

`EditorLimits`: `maxFixtureBytes` 8 MiB (the CLI's), `maxFontBytes` and `maxImageBytes` 4 MiB and
`maxTotalFontBytes` 16 MiB (the renderer's), `renderTimeoutMs` 10 000, `rasterTimeoutMs` 120 000. Every file the user picks is size-checked before
it is read. Design files are bounded by `DesignLimits` on import and on every edit: an edit that would make the exported
file longer than `maxSourceLength` is refused.

## Content Security Policy

The app's page sets `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' blob:
data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`: only the app's own
scripts, worker and stylesheet load, nothing inline runs, and the page makes no request (the dev server alone allows
`connect-src 'self'` for its reload socket). A test builds the app and drives it in Chromium under this policy, raster
export included: the policy of the page does not apply to its workers, which take the policy of the headers their own
files are served with. A host that serves the app with a policy header must allow, for the raster worker,
`connect-src 'self'` (it fetches the two WebAssembly files) and `script-src 'wasm-unsafe-eval'` (it compiles them); the
page itself needs neither.

## Bundle

The initial chunk holds the editor and the format's validation (about 20 kB gzip, budget 120 kB). The YAML parser
(reading and writing) and the font parser load on first use; the renderer lives only in the two workers: the preview
worker (budget 250 kB gzip) and the raster worker, which also holds the rasterizer and the encoders (about 184 kB gzip,
budget 230 kB). The two WebAssembly files (resvg 2.5 MB, libwebp 0.5 MB) are separate assets, never inlined, fetched
only by a raster export. A test bundles the app and checks the budgets, which chunk holds what, that the rasterizer is
in the raster worker alone, and that the editor pins the WebAssembly packages to the versions `@readmint/raster` pins.
The app build also writes the licence texts of the WebAssembly files to `licences/`.

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
  save: ({ name, text }) => store(name, text), // optional, default a download (design.json, design.yaml)
  saveImage: ({ name, mimeType, bytes }) => store(name, bytes), // optional, default a download (design.png, design.webp)
});
editor.dispatch((state) => moveLayer(state, "/layers/0", 10, 0));
```

The state (`EditorState`: design, selection, fixture data, session assets, font checks, issues) is immutable; every
command (`addLayer`, `moveLayer`, `resizeLayer`, `setLayerProperty`, `reorderLayer`, `removeLayer`, `selectLayer`,
`uploadFont`, `setFontAsset`, `attachAsset`, `loadFixture`) is a pure function returning a new state whose design
passes `validateDesign`, or the same design with the issues saying why not.
