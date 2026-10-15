# CLI

`readmint` renders and checks designs on your own computer, with the same renderer the GitHub Action uses: the same
design, assets and data give the same SVG bytes, and the same PNG, WebP, APNG or GIF bytes. Data comes from a local JSON file (fixture data), so no token and no
network are needed.

```sh
readmint render design.json --data fixture.json --out card.svg
readmint render design.json --data fixture.json --out card.webp --scale 2 --frame-rate 30
readmint validate design.json
readmint preview design.json --data fixture.json
```

`render` writes SVG, or a raster image of it: PNG, WebP, APNG or GIF (see [raster.md](raster.md)). An animated design
becomes an animated WebP, APNG or GIF; `png` is always a still image (the frame at `--time`, else the first).

## Commands

| command                | does                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `render <design>`      | renders the design; writes the SVG to standard output (no trailing newline) or to `--out`, a raster image to `--out` |
| `validate <design>`    | checks the design and loads every asset it declares; with `--data` also renders it and reports its issues            |
| `preview <design>`     | serves a live preview on `http://127.0.0.1:<port>/`, reloaded whenever an input file changes                         |
| `help`, `-h`, `--help` | prints the usage                                                                                                     |
| `--version`            | prints the version                                                                                                   |

Without `--data`, `validate` does not render: every binding would fail. Every asset the design declares with a path is
loaded, used or not, so a broken reference fails `validate` too.

## Options

| option             | commands             | meaning                                                                                                                                                                                                                           |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--root <dir>`     | all                  | the folder the design file must lie in; default the current folder                                                                                                                                                                |
| `--data <file>`    | all                  | fixture data (below)                                                                                                                                                                                                              |
| `--locale <tag>`   | all                  | BCP 47 language tag for the `number`, `compact`, `percent` and `date` filters; default the design's `locale`, else `en`; a tag the expression tables lack (`en`, `de`, `fr`, `es`, `cs`, or a region tag of one) is a usage error |
| `--time <ms>`      | `render`, `validate` | renders that frame of the animation as a static SVG (or a still raster image), in 0..86400000                                                                                                                                     |
| `--out <file>`     | `render`             | writes the output to this file (its folder must exist) instead of standard output; written only once the whole output is made, so a failed raster export leaves it as it was                                                      |
| `--format <name>`  | `render`             | `svg`, `png`, `webp`, `apng` or `gif`; default from the `--out` extension (`.png`, `.apng`, `.webp`, `.gif`), else `svg`; a raster format without `--out` is a usage error                                                        |
| `--scale <n>`      | `render`             | raster pixels per design pixel, 1..4 (up to three decimals); default 2; raster formats only                                                                                                                                       |
| `--frame-rate <n>` | `render`             | frames per second sampled from the animation, a whole number in 1..60 (`gif` 1..50); default 30, `gif` 25; raster formats only                                                                                                    |
| `--quality <n>`    | `render`             | lossy WebP at this quality, a whole number in 1..100; default lossless; `webp` output only (any other format is a usage error)                                                                                                    |
| `--port <n>`       | `preview`            | port in 0..65535; default 4870, `0` picks a free one                                                                                                                                                                              |

An option a command does not take, an unknown option, a missing or extra argument and a bad value are usage errors
(exit code 2). There is no host option: the preview listens on 127.0.0.1 only.

## Exit codes

| code | name       | meaning                                                                                                                                                                         |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `ok`       | done; warnings (such as `animation-cut`) may have been printed                                                                                                                  |
| 1    | `invalid`  | the design is invalid (parse, schema, references, not UTF-8, too large), an asset was refused, the render failed, or a raster export failed (a limit in [raster.md](raster.md)) |
| 2    | `usage`    | unknown command or option, missing or extra argument, bad option value                                                                                                          |
| 3    | `input`    | a file, folder or port cannot be used: design file missing or outside `--root`, fixture data unreadable or invalid, `--out` or standard output not writable, port in use        |
| 70   | `internal` | a bug in Readmint                                                                                                                                                               |

`@readmint/cli` exports the same values as `ExitCode`.

Every command that writes to standard output (`render`, `validate`, `help`, `--version`) exits with 3 and prints
`cannot write standard output (<code>)` when the system refuses the write, such as `EPIPE` for a reader that went away.
A standard output that was closed (`readmint render design.json >&-`) cannot be told apart: Node gives the process the
null device instead (on Linux and macOS it reopens a closed descriptor on `/dev/null`; on Windows it reads as a
character device like `NUL`), writes succeed, and the exit code is 0 as with `>/dev/null`.

Ctrl+C (SIGINT) and SIGTERM are caught once: `render` and `validate` ignore the first one and finish the running command
with its own exit code; only `preview` stops on it (exit code 0). A second signal ends the process at once, as usual.

## Messages

Issues go to standard error, one line each: `<design>:<line>:<column>: error <code> at <path>: <message>` (the position
only for issues found while parsing), or `warning` for a warning of a successful render. `<design>` is the design file
relative to `--root`, `<path>` a JSON Pointer into the design. `validate` prints `<design>: ok` to standard output.

Every line the CLI prints escapes control characters (C0, C1), format characters (bidi marks, embeddings, overrides and
isolates, zero-width characters), line and paragraph separators, private-use, unassigned and surrogate code points as
`\uXXXX`: renderer messages quote data values as they are, and a design or a data file must not be able to spoof a
terminal or a log. Messages never carry an absolute path or a Node error text.

## The design file and its assets

The design file must lie inside `--root` (default: the current folder), checked by real path like an asset path (see
[asset-loading.md](asset-loading.md)): a design reached through a link that leaves the root is refused. The design is
read as UTF-8 (at most 12 MiB, the format's source limit); `.json` is read as JSON, `.yaml` and `.yml` as YAML, any other
extension by its first character. Its assets resolve against the design file's folder through `readAsset`, with the
renderer's limits (`maxFontBytes`, `maxImageBytes`); `data:` sources are left to the renderer. Assets that resolve to
the same real path (however it is spelled: `a.ttf`, `./a.ttf`, a symlink) are read once and
share one byte array, so the renderer decodes such a font once and counts it once against `maxTotalFontBytes` (it also
recognises equal bytes in different arrays). The Action loads assets the same way.

## Fixture data

`--data` names a JSON file holding what the data sources would provide, keyed by namespace:

```json
{ "github": { "version": 0, "login": "octocat", "followers": 42 } }
```

It must be a JSON object, at most 8 MiB, UTF-8; every key must be a data namespace (a lowercase letter, then up to 31
lowercase letters or digits, not `true`, `false` or `null`). The `github` shape is in
[data-github.md](data-github.md). The file is the user's own and may lie anywhere. The CLI reads no token and no
environment variable, and makes no network request.

## Preview

`readmint preview` prints `preview: http://127.0.0.1:<port>/` and serves the render until it is stopped (Ctrl+C
or SIGTERM, exit code 0). The page shows the SVG exactly as `render` writes it and the current issues. Every 300 ms it checks the
design file, the fixture data and every asset file the design declares (also one that does not exist yet). A change
counts once it reads the same on two consecutive checks, so the preview renders again up to about 600 ms after a save
and the page reloads; a file still being written is not rendered half done, and a file that changes on every check is
not rendered until it stops changing. A save that lands while a file is being read (an editor writing a temporary
file and renaming it over the design or an asset) is read again, up to four reads about 150 ms apart in all, before
"changed while it was being read" is shown. A render that fails keeps the last good SVG and shows the issues.

The preview is for this computer only:

- it listens on the literal address `127.0.0.1`, never on another interface, and has no host option;
- it answers 403 unless the `Host` header is `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding), and to a request
  a browser marks as coming from another site (`Sec-Fetch-Site`);
- it serves a fixed set of routes from memory (`/`, `/render.svg`, `/status`, `/events`), never a file: any other path
  is 404, any method but GET and HEAD 405;
- the SVG is served with a Content Security Policy that allows only inline styles and `data:` images and fonts, the page
  with one that allows only its own script and requests;
- at most 8 pages can follow the changes at once; a ninth event stream is refused with 503.

A port in use, or one the system refuses, is exit code 3.

## Programmatic use

`@readmint/cli` exports `runCli(argv, io)` (returns the exit code, never throws), `ExitCode`, `CliError`, `CliIo`,
`escapeForLog`, `quoteForLog`, `formatIssue`, `localeProblem(locale)` (why a tag cannot be the `--locale`, `undefined` when it can; the Action's `locale` input uses it too), `outputFormats` and `outputExtension(format)` (the `OutputFormat`s and their file extension, `apng` → `png`), and the loaders the commands share: `loadDesignFile`, `loadDesignAssets`,
`loadFixtureData` (with `maxFixtureBytes`, its size cap), `loadRenderInput` (design file, assets and fixture data in one call; `RenderInput`,
`RenderInputOptions`), `renderInput` (`renderSvg` of a loaded input with the renderer's default limits) and `renderOutput(input, formats,
options)` (one render, then each format: the SVG, or `exportRaster` of it; a raster failure is a `CliError` with exit code
1). The GitHub Action ([action.md](action.md)) renders through `loadRenderInput` and `renderOutput`, so it writes the
bytes `readmint render` writes.
