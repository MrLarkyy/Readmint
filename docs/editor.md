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
  hold placeholders. An invalid value is refused with the format's issue; the design is unchanged. A layer's `orbit`
  ([design-format.md](design-format.md#orbit)) is listed read-only, as compact JSON: it is edited in the design file,
  and editing the layer's other properties keeps it as it is.
- **Fonts**: upload a TTF, OTF, WOFF or WOFF2 file (see below).
- **Images**: upload a PNG, JPEG, GIF or WebP file; it is embedded in the design with an image layer showing it
  ([below](#images)).
- **Fixture data**: load a JSON file of data namespaces, as the CLI's `--data` file; bindings render against it.
  The editor never fetches data: a JSON document the CLI's `--data-json` or the Action's `data-json` would load is
  given here as fixture data under its namespace, `{ "<namespace>": { "version": 0, "document": <the JSON> } }`
  ([data-sources.md](data-sources.md#the-json-source)). A feed the CLI's `--data-feed` or the Action's `data-feed` would load is likewise given as fixture data under its namespace, `{ "<namespace>": { "version": 0, "title": ..., "link": ..., "entries": [...] } }` ([data-sources.md](data-sources.md#the-feed-source)).
- **Settings**: "Load settings" takes a settings file (the CLI's `--props` and the Action's `props-file`: JSON, `{ "<section>": { "<prop>": value } }`) and the "Settings section" list applies one of its sections to the root component layers, as `applyDesignProps` of `@readmint/format` does. Importing a design file picks the section named like it (`propsSection`: `header.json` and `header.dark.json` take `header`) when the file has one; loading a settings file again keeps the current section if the new file still has it, else takes that one. New keeps the settings file but chooses no section, and "No section" renders the design as it is. The chosen section's props win over the layer's own values in the preview and the raster export, so editing such a prop in the property panel shows no change until "No section". The settings are an input of the session, like fixture data: never part of the design, its history or its export. A section that does not apply (a wrong type, a design without a root component layer) is listed as a `settings` issue by its pointer, never with a value; the preview then shows the design without it and the raster export is refused with an `export` issue, as the CLI would exit with 1.

  With a section chosen, the **settings form** (left column, headed by the section name) edits its props: one field per prop the root components declare, in declaration order: a text or colour input, a number input (a number or a `{{binding}}`), a checkbox, a select for an enum, and for a list one input per item with "Add item" and "Remove item" (new items are strings; an edited number or boolean item stays one while the text fits). A prop the section lacks shows what renders instead, greyed: the chosen variant's value (when it applies), else the chosen manifest render's, else the value its root component layer sets, else the design's default; it is written only once edited; "Unset" removes a prop from the section. A change is committed when the field changes or Enter is pressed and the preview and the raster export follow. Every edit is checked as the CLI reads a `--props` file (a prop name is an id, a value a string, number, boolean or a list of those) and refused with a message that names the prop and never quotes a value; a list longer than `maxSettingsListItems` (1000, the format's cap) is shown read-only without inputs. Settings edits are not undo steps: like loading the file they belong to the session. **Warnings** do not block the preview: a prop in the section that no root component declares (listed in the form with "Remove"), and a declared prop that neither the section, a root component layer nor the prop's default sets (nothing is rendered for it). The unknown prop makes the CLI refuse the section, so the PNG and WebP export is refused with a message naming it until it is removed; at most 100 warnings are listed.

  "Export settings" (enabled once a file is loaded) saves `settings.json` in the format `--props` and `props-file` read. The text of the loaded file is kept: with no edit the export is exactly the loaded file, and an edit replaces only the value of the edited section (two-space indented at its key's indent), so every other section stays byte for byte, BOM and line ends included. A settings file is read as strict UTF-8 as the CLI does (otherwise refused with "settings file is not valid UTF-8") and its BOM is kept. New, Import and loading keep the loaded text. Importing the export gives the same sections, and `readmint render --props` renders the same image as the preview.

- **Render manifest**: "Load manifest" takes a render manifest (the CLI's `render --manifest` file, JSON, parsed by `parseRenderManifest` of `@readmint/format`; the cap is `maxManifestBytes`, strict UTF-8) and the "Render" list shows its renders as `<name> (<design>)`, with "No render" first. A render applies to the open design when the last segment of its `design` path is the imported file's name (`repo.json`): the browser has no folder, so import the design file separately, and two designs of one file name in different folders cannot be told apart. A render of another design file is listed but disabled, and choosing it by command is refused with an issue naming that file. Choosing a render previews and exports the design as `readmint render --manifest` renders it, in the CLI's order: the render's `props` first (`applyDesignProps`), then the variant, then the settings section named like the render (the render's name only: no fallback to the design file's section; the section is chosen when the settings file has it, else none, and loading a settings file prefers it). A section prop that the render also sets wins, with a warning. A render that lists `variants` offers only those (with an empty list the Variant list is disabled and says so) and drops a chosen variant it does not list; a render without a list keeps the session's variant, and a variant that sets a prop the render also sets is a `manifest` issue with the CLI's pointer and message (`manifest /renders/<i>/props/<prop>: the prop <prop> is also set by the <variant> variant; set it in one place`): the preview then shows the render without the variant and the raster export is refused, as the CLI exits with 1. A render whose props do not fit the design is a `manifest` issue by pointer, never a value. Loading a manifest again keeps the chosen render only if it still names the open design file, under the rules of choosing it (a variant it no longer lists is dropped, its section is chosen again); otherwise it behaves as "No render". Importing a design file with a manifest loaded keeps the chosen render if it names the file, else takes the first render that does (`repo.json` takes `repo-1`), and chooses its section; "No render" returns to the file's own section. The manifest and the chosen render are inputs of the session, like the settings: never part of the design, its history or an export; undo and redo keep them, and New keeps the manifest with no render.
- **Variant**: the "Variant" list switches the preview and the PNG and WebP export between Light (the design as it is) and `dark`, the render variant of `@readmint/format` (`renderVariants`): `theme: dark` set on the root component layers, as `readmint render --variant dark`. The design must declare a `theme` prop on a root component; otherwise the list is disabled and says why ("no top-level component declares `theme`"). The variant is applied first and the settings section after it, as the CLI does, so a section that sets `theme` wins, with a warning naming the section and the prop; with a variant chosen the settings form shows the variant's value, greyed, for a prop the section lacks. A variant that does not fit the design (an enum without `dark`, another type) is listed as a `variant` issue by its pointer, never with a value; the preview then shows the design without it and the PNG and WebP export is refused. The variant is an input of the session, like fixture data: never part of the design, its history or any export, and switching it is not an undo step (undo and redo keep it). Import keeps it when the imported design declares `theme` and drops it otherwise; New clears it. Importing a `card.dark.json` twin still picks the `card` settings section, as before. With a manifest render chosen the list is limited to the variants the render lists ([Render manifest](#what-can-be-edited)).

- **Import and export**: import a JSON or YAML design file (validated with the format's limits); export the design as
  `design.json` (two-space JSON, a final line feed, the same bytes for the same design), as `design.yaml` (YAML 1.2,
  keys in the design's own order, no anchors; refused with an `export` issue naming both lengths when it would pass the
  YAML reader's 1 MiB, then export JSON), or as `design.png` / `design.webp` ([below](#raster-export)). A file export
  re-imports to the same design; an image is what the CLI renders.

Every edit of the design can be undone and redone ([below](#undo-and-redo)). Not in this version: animation editing
(animated designs import and preview, their timeline is not edited), APNG or GIF export, and scale, frame rate or
quality settings for the raster export.

Dragging writes whole numbers. It never changes a coordinate or size bound to data, nor the place of a layer a stack
or grid layout positions (its `x`/`y` are offsets in its slot; the property panel says so): such a drag is refused with
an issue. A path keeps its size (its data is its shape); a text's handles set its wrapping `width`. In a turned group a
drag is turned back into the group's coordinates, so the layer follows the pointer; a layer on an orbit moves its
`x`/`y` offset from its orbit point the same way (its box is drawn at the orbit's angle at the start of the timeline). Resize handles appear only on a
layer that neither it nor any group around it turns (whole turns aside): turns that cancel out on the canvas still swap
what the layer calls width and height.

## Undo and redo

Ctrl+Z (Cmd+Z) undoes the newest edit of the design; Ctrl+Shift+Z or Ctrl+Y (Cmd+Shift+Z, Cmd+Y) redoes it, as do the
toolbar's Undo and Redo buttons, which are disabled when there is nothing to step to. The letter is the one the layout
types; on a layout without Latin letters (Cyrillic, Greek) it is the key in the Z or Y place. In a text field, a select
or editable content the keys are the field's own: the editor's undo never takes them there.

Every command that changes the design is one entry (a drag is one, recorded when the pointer is released; an upload
adds its asset and layer as one); a refused command, an edit that changes nothing (a drag that rounds to no move, a
value set to what it is), a selection, loading fixture data, attaching a file for a path-sourced asset and reading
font licences are not entries. When the design changes during a drag (an undo, a redo, an upload finishing), the drag
is dropped: releasing the pointer changes nothing. Undo and redo restore the design and the layer selected
with it, and clear the issue list; fixture data, settings, the manifest and its render, attached files and font checks are inputs of the session and stay as
they are. A new edit after an undo drops what could have been redone. The history holds the last
`EditorLimits.maxHistory` (100) edits, the oldest dropped first; entries share the unchanged parts of the design, so
they cost little. New and Import start an empty history.

## Preview

Every change re-renders with `renderPreview`, which is `renderSvg(design, { data, assets, layerBoxes: true })` and
nothing more; `design` is `effectiveDesign(state)`: the design with the chosen render's props, the variant and the chosen settings section applied. It runs in a module Web Worker: a hostile design can keep only the worker busy, and a render running
longer than `EditorLimits.renderTimeoutMs` (10 s) is stopped (the worker is replaced) and reported. A worker that fails
(an error, a result it cannot send) is reported at once and replaced for the next render. A newer edit's render always
wins: an older result arriving later is dropped.

The SVG is shown as an `<img>` of its exact bytes (a blob URL), as the CLI preview and a README show it: its ids and
styles never meet the page or another copy, and it runs no script. The editor draws its own selection overlay from
the renderer's `layerBoxes` ([renderer.md](renderer.md#report)), which never change the SVG. The render's issues and
warnings are listed under the editor with their design pointer; one inside a layer selects it when clicked. After a
render fails, the image keeps showing the last good render, but clicking the canvas selects nothing until a render
succeeds (the layer tree still does): the old boxes may no longer match the design.

Exporting the design and rendering it with `readmint render design.json --data <fixture>` (and `--props <settings>` when a section is chosen, `--variant dark` when the dark variant is; the design file's name picks the section) gives the preview's bytes; with a manifest render chosen, `readmint render --manifest renders.json --out-dir o --data <fixture> [--props <settings>] [--variant dark]` (`--variant dark` for a render that lists no variants and the session's Dark) writes `o/<render>.svg` (and `<render>.dark.svg` when the render lists `dark`) with the preview's bytes;
a golden suite (`packages/editor/test/editor-session.golden.ts`, Node and Chromium) and a CLI test pin it.

## Raster export

The toolbar's "Export PNG" and "Export WebP" make the image the CLI makes for the same design, fixture data and settings section:
`readmint render design.json --data data.json --format png|webp` with its defaults (scale 2, lossless WebP). The export
is `renderSvg(design, { data, assets, time })` for each frame, as the CLI renders it, passed to `exportRaster` of
`@readmint/raster/browser` ([raster.md](raster.md#in-the-browser)): a still design gives a still image, a design with a
timeline an animated WebP (a PNG of its first frame). The files are `design.png` and `design.webp`, and `design.dark.png` and `design.dark.webp` with the dark variant chosen; with a manifest render chosen the stem is the render's name (`repo-3.png`, `repo-3.dark.png`), as the files `readmint render --manifest` writes, and the bytes are those files'.

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

## Images

An uploaded image becomes an image asset whose `src` is a base64 `data:` URI of the type its bytes are (sniffed, never
taken from the file name), so the design file carries it, and an image layer at the canvas's top-left corner shows it:
at its pixel size as it is shown (EXIF orientations that turn it a quarter swap width and height), scaled down, never
up, to fit a canvas of literal size, in whole pixels. It goes into the selected group, else to the top level, and is
selected. The asset id is made from the file name (`image` when nothing of it is left), the layer takes the same id when
it is free. Undo removes the asset and the layer together.

Before anything is added, the file goes through the checks the renderer runs on one image asset, in its order, with
its bounds (`readImageFile`):

- a file larger than `EditorLimits.maxImageBytes` (the renderer's `maxImageBytes`, 4 MiB) is refused before it is read;
- the format is sniffed from the bytes: PNG, JPEG, GIF or WebP; anything else, SVG included (it can carry scripts), or a
  malformed or truncated file is refused with the sniffer's reason. A JPEG's image data is walked to its Huffman
  symbols, never decoded to pixels ([renderer.md](renderer.md#images)): data the browsers and resvg would draw apart
  is refused, as is a file past the check's step bound;
- a side longer than the renderer's `maxImageSide` (8192 pixels) or more animation frames than its
  `maxAnimationFrames` (1000) is refused, naming the limit;
- an image that would make the exported file longer than `DesignLimits.maxSourceLength` is refused, naming both
  lengths. Base64 makes the data URI a third larger than the file, so this bounds an upload to about 3 MiB in practice,
  less what the design already holds.

A refused image leaves the design unchanged, with an `image` issue saying why; so does a file that cannot be read or a
check that fails to load. The check loads on the first upload, never with the page, and runs on the page's thread: it
decodes no pixels, but a JPEG's symbol walk takes about 0.1 s for a 3 MB baseline file, 0.2 s for a progressive one.
The renderer keeps an accepted JPEG's result per module instance ([renderer.md](renderer.md), Images): the preview
worker checks it once for all its later renders, the raster worker once for every frame and the pixel count of an
export; the upload check on the page thread keeps its own.

The upload checks the file alone. What a render bounds over the whole design is the preview's to report, as for an
imported design, with the design kept: the JPEG data of all its images together (`maxRenderEntropySteps`), the SVG's
`maxOutputBytes` (5 MiB; an image's data URI is written once however many layers show it), and for a raster export
the image pixels it decodes (`RasterLimits.maxImagePixels`, [raster.md](raster.md)). The asset panel lists a `data:`
image or font as embedded in the design, by the CLI's rule (a `data:` source is the renderer's to decode, a
`{{binding}}` is fetched, anything else is a path), without decoding it: a malformed one is the preview's issue, never
a file to attach. A golden fixture (`session-image`) and a CLI test pin that an uploaded image previews as the CLI
renders it.

## Assets given by path

An imported design may name font or image files by path. The asset panel lists them as needing a file; a file picked
there is used by the preview for this session only (same size limits, checked before the file is read) and never
written into the design, which keeps
the path, so the CLI reads the same file next to the design. Image URLs bound to data are not fetched: the editor makes
no network request but the raster worker's fetch of its two WebAssembly files from the app's own origin, and it never
handles a token. The renderer's `missing-asset` issue is shown instead. Only an asset given by path takes a file:
`attachAsset` refuses one for an embedded (`data:`) or bound asset with an `asset` issue, as the CLI never reads a file
for those and the preview would otherwise draw bytes the CLI does not.

## Limits

`EditorLimits`: `maxFixtureBytes` 8 MiB (the CLI's), `maxSettingsBytes` (three bytes per character of `DesignLimits.maxSourceLength`, as the CLI's `--props` cap; an edit is refused when the file would pass `maxSourceLength` characters, as the CLI reads it), `maxManifestBytes` (three bytes per character of `RenderManifestLimits.maxSourceLength`, as the CLI's manifest cap), `maxSettingsListItems` 1000 (a prop list; the format's cap), `maxFontBytes` and `maxImageBytes` 4 MiB and
`maxTotalFontBytes` 16 MiB (the renderer's), `maxHistory` 100 edits, `renderTimeoutMs` 10 000, `rasterTimeoutMs`
120 000. Every file the user picks is size-checked before it is read. Design files are bounded by `DesignLimits` on import and on every edit: an edit that would make the exported
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
(reading and writing), the font parser and the image check (the renderer's sniffer, without the renderer) load on
first use; the renderer lives only in the two workers: the preview
worker (budget 250 kB gzip) and the raster worker, which also holds the rasterizer and the encoders (about 184 kB gzip,
budget 230 kB). The two WebAssembly files (resvg 2.5 MB, libwebp 0.5 MB) are separate assets, never inlined, fetched
only by a raster export. A test bundles the app and checks the budgets, which chunk holds what, that the rasterizer is
in the raster worker alone, and that the editor pins the WebAssembly packages to the versions `@readmint/raster` pins.
The app build also writes `licences/THIRD-PARTY.txt`: the name, version, licence and licence texts of every npm
package bundled into the page or a worker (fflate, gifenc, yaml, the font and WebAssembly packages), made by the
same script as the Action bundle's banner, with the notices of the WebAssembly code (resvg's Rust crates, libwebp).

## API

```ts
import {
  mountEditor,
  renderPreview,
  exportDesign,
  uploadFont,
  uploadImage,
  EditorLimits,
} from "@readmint/editor";

const editor = mountEditor(document.getElementById("app")!, {
  initial: design, // optional, default an empty canvas
  save: ({ name, text }) => store(name, text), // optional, default a download (design.json, design.yaml)
  saveImage: ({ name, mimeType, bytes }) => store(name, bytes), // optional, default a download (design.png, design.webp, design.dark.png, design.dark.webp; <render>.png ... with a manifest render chosen)
  saveSettings: ({ name, text }) => store(name, text), // optional, default a download (settings.json)
});
editor.dispatch((state) => moveLayer(state, "/layers/0", 10, 0));
editor.dispatch((state) => uploadImage(state, { name: "logo.png", bytes })); // bytes: Uint8Array
editor.undo(); // as Ctrl+Z; editor.redo() as Ctrl+Shift+Z
```

The state (`EditorState`: design, selection, fixture data, settings, manifest, variant, session assets, font checks, issues) is immutable; every
command (`addLayer`, `moveLayer`, `resizeLayer`, `setLayerProperty`, `reorderLayer`, `removeLayer`, `selectLayer`,
`uploadFont`, `uploadImage`, `setFontAsset`, `attachAsset`, `loadFixture`, `loadSettings`, `chooseSection`, `loadManifest`, `chooseRender`, `setSettingsProp`, `setVariant`) is a pure function returning a new state
whose design passes `validateDesign`, or the same design with the issues saying why not. `setVariant(state, name)` chooses the variant `name` (or none with `undefined`) and changes no design; an unknown name, a design without `theme` or a variant the chosen manifest render does not list is refused with a `variant` issue (`EditorIssue` source `variant`). `settingsFields` reports `from: "variant"` for a value the variant gives and `from: "render"` for one the chosen manifest render gives. `loadManifest(state, text, designFile?)` keeps the parsed renders (a refused manifest leaves the state, with `manifest` issues; the chosen render stays only while it names `designFile`, under the rules of choosing it) and `chooseRender(state, name, designFile)` applies a render of that design file, or none with `undefined` (`EditorIssue` source `manifest`). `setSettingsProp(state, prop, value)` sets or (with `undefined`) removes a prop of the chosen settings section and changes no design; `exportSettings(settings)` is the text "Export settings" saves and `settingsFields(state)` the fields of the form. `effectiveDesign(state)` returns, besides the design and its `issues`, `warnings` (an `EditorIssue` with `severity: "warning"`, shown as `warning: ...`) and `unknownProps`. `readImageFile(bytes)` is
the check an upload runs. The history (`EditorHistory`) is an immutable value of its own, kept by `mountEditor` beside
the state: `recordEdit(history, before, after)` records a design change, `undo(history, state)` and `redo(...)` return
the next history and state (undefined when there is nothing to step to), `canUndo` and `canRedo` say whether there is.
