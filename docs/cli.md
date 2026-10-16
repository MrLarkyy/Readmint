# CLI

`readmint` renders and checks designs on your own computer, with the same renderer the GitHub Action uses: the same
design, assets and data give the same SVG bytes, and the same PNG, WebP, APNG or GIF bytes. Data comes from a local JSON file (fixture data), so no token and no
network are needed; with `--github` it is the live GitHub data instead, loaded with your token from the environment
exactly as the Action loads it ([Live GitHub data](#live-github-data)). `--data-json` adds any JSON document, a file
in your repository or an https URL, under a namespace of its own ([JSON data](#json-data)), and `--data-feed` the latest
entries of an RSS or Atom feed ([Feed data](#feed-data)).

```sh
readmint render design.json --data fixture.json --out card.svg
readmint render design.json --data fixture.json --out card.webp --scale 2 --frame-rate 30
readmint validate design.json
readmint preview design.json --data fixture.json
GH_TOKEN=<token> readmint render design.json --github --login octocat --out card.svg
readmint render design.json --data-json stats=stats.json --out card.svg
```

`render` writes SVG, or a raster image of it: PNG, WebP, APNG or GIF (see [raster.md](raster.md)). An animated design
becomes an animated WebP, APNG or GIF; `png` is always a still image (the frame at `--time`, else the first).

## Commands

| command                | does                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `render <design>`      | renders the design; writes the SVG to standard output (no trailing newline) or to `--out`, a raster image to `--out`                                                           |
| `validate <design>`    | checks the design and loads every asset it declares; with data (`--data`, `--github`, `--data-json` or `--data-feed`) also renders it and reports its issues                   |
| `preview <design>`     | serves a live preview on `http://127.0.0.1:<port>/` (with `--github`, `--data-json` or `--data-feed` under a per-session secret path), reloaded whenever an input file changes |
| `help`, `-h`, `--help` | prints the usage                                                                                                                                                               |
| `--version`            | prints the version                                                                                                                                                             |

Without data (`--data`, `--github`, `--data-json` or `--data-feed`), `validate` does not render: every binding would fail. Every asset the design
declares with a path is loaded, used or not, so a broken reference fails `validate` too. An image `src` bound to data is
fetched only with `--fetch-images` and data (there is nothing to bind it to otherwise); with `--fetch-images` and no
data it fails `image-binding`.

## Options

| option                                             | commands             | meaning                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--root <dir>`                                     | all                  | the folder the design file must lie in; default the current folder                                                                                                                                                                                                                                                                                                                     |
| `--data <file>`                                    | all                  | fixture data (below)                                                                                                                                                                                                                                                                                                                                                                   |
| `--props <file>`                                   | all                  | settings: root component props by section, merged into the design ([Settings file](#settings-file))                                                                                                                                                                                                                                                                                    |
| `--locale <tag>`                                   | all                  | BCP 47 language tag for the `number`, `compact`, `percent` and `date` filters; default the design's `locale`, else `en`; a tag the expression tables lack (`en`, `de`, `fr`, `es`, `cs`, or a region tag of one) is a usage error                                                                                                                                                      |
| `--time <ms>`                                      | `render`, `validate` | renders that frame of the animation as a static SVG (or a still raster image), in 0..86400000                                                                                                                                                                                                                                                                                          |
| `--out <file>`                                     | `render`             | writes the output to this file (its folder must exist) instead of standard output; written only once the whole output is made, so a failed raster export leaves it as it was                                                                                                                                                                                                           |
| `--format <name>`                                  | `render`             | `svg`, `png`, `webp`, `apng` or `gif`; default from the `--out` extension (`.png`, `.apng`, `.webp`, `.gif`), else `svg`; a raster format without `--out` is a usage error                                                                                                                                                                                                             |
| `--scale <n>`                                      | `render`             | raster pixels per design pixel, 1..4 (up to three decimals); default 2; raster formats only                                                                                                                                                                                                                                                                                            |
| `--frame-rate <n>`                                 | `render`             | frames per second sampled from the animation, a whole number in 1..60 (`gif` 1..50); default 30, `gif` 25; raster formats only                                                                                                                                                                                                                                                         |
| `--quality <n>`                                    | `render`             | lossy WebP at this quality, a whole number in 1..100; default lossless; `webp` output only (any other format is a usage error)                                                                                                                                                                                                                                                         |
| `--port <n>`                                       | `preview`            | port in 0..65535; default 4870, `0` picks a free one                                                                                                                                                                                                                                                                                                                                   |
| `--open`                                           | `preview`            | opens the printed address (with `--github`, `--data-json` or `--data-feed` a one-time launch address that redirects to the secret one) in the default browser: `rundll32 url.dll` on Windows, `open` on macOS, `xdg-open` elsewhere; if that cannot start, one line says so and the preview keeps serving                                                                              |
| `--fetch-images`                                   | all                  | fetches the images whose `src` is bound to data (https, allowed hosts only, no credentials; see [asset-loading.md](asset-loading.md#images-bound-from-data)); without it a design with one fails `image-not-fetched` (with `--data`, `--github`, `--data-json` or `--data-feed`) and no image is requested (only `--github`, a `--data-json` URL and `--data-feed` make requests then) |
| `--github`                                         | all                  | loads the live GitHub data as `{ github }` with the token from `GH_TOKEN`, else `GITHUB_TOKEN` ([Live GitHub data](#live-github-data)); excludes `--data`                                                                                                                                                                                                                              |
| `--login <login>`                                  | all                  | the GitHub login `--github` loads; default the token's owner; only with `--github`                                                                                                                                                                                                                                                                                                     |
| `--data-json [<ns>=]<source>`                      | all                  | loads a JSON document, a file inside `--root` (its path is relative to `--root`, not to the current folder) or an https URL, as `{ <ns>: { version: 0, document } }` (default namespace `json`); repeatable, at most 8, added to `--data` or `--github` data ([JSON data](#json-data))                                                                                                 |
| `--data-json-header <ns>:<Header-Name>=<ENV_NAME>` | all                  | sends the header to the https URL of `<ns>` with the value of the environment variable `ENV_NAME`, never an argument; repeatable, at most 8 per source ([JSON data](#json-data))                                                                                                                                                                                                       |
| `--data-feed [<ns>=]<url>`                         | all                  | loads an RSS 2.0 or Atom 1.0 feed from an https URL as `{ <ns>: { version: 0, title, link, entries } }` (default namespace `feed`), entries newest first; repeatable, at most 8, added to `--data` or `--github` data ([Feed data](#feed-data))                                                                                                                                        |
| `--data-feed-limit <ns>=<n>`                       | all                  | entries kept from the feed of `<ns>`, 1 to 50 (default 5); repeatable ([Feed data](#feed-data))                                                                                                                                                                                                                                                                                        |

An option a command does not take, an unknown option, a missing or extra argument and a bad value are usage errors
(exit code 2), as are `--github` with `--data`, `--login` without `--github`, a `--data-json` namespace given twice or
named `github` with `--github`, more than 8 JSON sources or feeds, a `--data-feed` namespace given twice or also a `--data-json` namespace, a `--data-feed-limit` that is not `<ns>=<n>` (n from 1 to 50) or names a namespace without a feed, and a `--data-json-header` that is not
`<ns>:<Header-Name>=<ENV_NAME>` or names a namespace without a source. There is no `--token` option: `--token`
and any argument shaped like a GitHub token (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`) are usage errors
whose message never shows the value. There is no host option: the preview listens on 127.0.0.1 only.

## Exit codes

| code | name       | meaning                                                                                                                                                                                                                                                                                          |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | `ok`       | done; warnings (such as `animation-cut`) may have been printed                                                                                                                                                                                                                                   |
| 1    | `invalid`  | the design is invalid (parse, schema, references, not UTF-8, too large), an asset was refused, the render failed, or a raster export failed (a limit in [raster.md](raster.md))                                                                                                                  |
| 2    | `usage`    | unknown command or option, missing or extra argument, bad option value                                                                                                                                                                                                                           |
| 3    | `input`    | a file, folder or port cannot be used: design file missing or outside `--root`, fixture data unreadable or invalid, a fixture key equal to a `--data-json` or `--data-feed` namespace, `--out` or standard output not writable, port in use                                                      |
| 4    | `data`     | `--github` without a token in `GH_TOKEN` or `GITHUB_TOKEN`, the GitHub data could not be loaded (`GitHub data (<code>): <message>`), a `--data-json` source could not be loaded (`JSON data <ns> (<code>): <message>`), or a `--data-feed` feed could not (`Feed data <ns> (<code>): <message>`) |
| 70   | `internal` | a bug in Readmint                                                                                                                                                                                                                                                                                |

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
An image bound from data that cannot be fetched is one such line at `/assets/images/<id>/src`, its code one of the
`RemoteImageError` codes (`image-binding`, `image-url`, `image-host`, `image-fetch`, `image-too-large`,
`image-format`, `image-not-fetched`; see [asset-loading.md](asset-loading.md#images-bound-from-data)), exit code 1.

Every line the CLI prints escapes control characters (C0, C1), format characters (bidi marks, embeddings, overrides and
isolates, zero-width characters), line and paragraph separators, private-use, unassigned and surrogate code points as
`\uXXXX`: renderer messages quote data values as they are, and a design or a data file must not be able to spoof a
terminal or a log. Messages never carry an absolute path or a Node error text.

## The design file and its assets

The design file must lie inside `--root` (default: the current folder), checked by real path like an asset path (see
[asset-loading.md](asset-loading.md)): a design reached through a link that leaves the root is refused. The design is
read as UTF-8 (at most 12 MiB, the format's source limit); `.json` is read as JSON, `.yaml` and `.yml` as YAML, any other
extension by its first character. Its assets resolve against the design file's folder through `readAsset`, with the
renderer's limits (`maxFontBytes`, `maxImageBytes`); `data:` sources are left to the renderer, and an image `src` bound
to data is fetched with `--fetch-images` after the data (`--data`, `--github`, `--data-json` or `--data-feed`) loads. Assets that resolve to
the same real path (however it is spelled: `a.ttf`, `./a.ttf`, a symlink) are read once and
share one byte array, so the renderer decodes such a font once and counts it once against `maxTotalFontBytes` (it also
recognises equal bytes in different arrays). The Action loads assets the same way.

## Fixture data

`--data` names a JSON file holding what the data sources would provide, keyed by namespace. It is a local file of yours and is not confined to a folder; the Action's `data-file` is confined to the workspace:

```json
{ "github": { "version": 0, "login": "octocat", "followers": 42 } }
```

It must be a JSON object, at most 8 MiB, UTF-8; every key must be a data namespace (a lowercase letter, then up to 31
lowercase letters or digits, not `true`, `false` or `null`). The `github` shape is in
[data-github.md](data-github.md). The file is the user's own and may lie anywhere. Without `--github` and
`--data-json-header` the CLI uses no token and no environment variable (it only keeps the values of `GH_TOKEN` and
`GITHUB_TOKEN` out of its messages, see below), and without `--github`, a `--data-json` URL and `--data-feed` it makes no network
request except, with `--fetch-images`, the image requests of
[asset-loading.md](asset-loading.md#images-bound-from-data). With `--data-json` or `--data-feed` the loaded namespaces are added to the
fixture data ([JSON data](#json-data), [Feed data](#feed-data)).

## Settings file

`--props` names a JSON file with the personal texts of a template, set once for all its sections, light and dark: an
object of sections, each an object of root props.

```json
{
  "header": { "intro": "I build developer tools." },
  "stack": { "labels": ["Tools"], "items": ["Git"] }
}
```

The section of a design is its file name without the extension (`.json`, `.yaml`, `.yml`) and without a trailing
`.dark`: `header.json` and `header.dark.json` both take the `header` entry. For each top-level `component` layer of
that design, each prop of the section that the layer's component declares is set on it and wins over the same prop written on the layer; the merged design
is then validated like any design, so a value takes the same types and limits, and a `{{ }}` string is a binding of the
same safe expression language. A prop the design's top-level components do not declare, a value of the wrong type or an
enum value the prop does not list is an error (exit code 1) naming the design, the section and the prop
(`header.json: error unknown-property at /header/colour: ...`), never the value. A render error at a prop the file set (a bad
binding) keeps its code and path, but its message only names the section and the prop; so does an error inside a
component the root layer uses (a fill that is no colour), or on the canvas, whose bindings read the root props (a
`background` that is no colour), whose message echoes a string or a number of the section as
the renderer quotes a value (`got "..."`, `got 7`). Expression errors there quote the design's own binding, and the
note of component instances and repeat items is design text, so neither counts. Every other message is printed as it
is. A design whose section the file lacks is
rendered as it is, and a section no design names is ignored. The output is the same as rendering the design with the
props written into its root layer; the design format is not involved (no `$schema`, no version).

The file is JSON, UTF-8, at most 4 MiB of text; section and prop names are ids (a letter, then letters, digits, `_` or
`-`, at most 64); a value is a string, a number, a boolean or an array of those. Like `--data` it is the user's own
file and may lie anywhere. A file that cannot be read exits with code 3, one whose content is invalid with code 1; the
message names the file and the pointer, not the content. `preview` watches the file and re-renders when it changes.
The Action takes the same file as [`props-file`](action.md#inputs). The profile templates ship one, see
[components.md](components.md#profile-templates).

## Live GitHub data

`--github` loads the data the Action renders with instead of a fixture file: `loadGitHubData` of
[data-github.md](data-github.md), bound as `{ github: <data> }`, the object a fixture file holds under `github`. The CLI
and the Action share this one load (`loadLiveData`), so the same GitHub answers give the same data and the same bytes
as `render --data` with that object.

- **The token** comes from the environment only: `GH_TOKEN`, else `GITHUB_TOKEN` (the first that is set and not
  empty; surrounding whitespace is dropped). The GitHub load reads it only with `--github`; in every run the CLI reads both variables, but only to redact them
  (below). It is never an argument: `--token` and a
  token-shaped argument are usage errors that do not print the value. Without a token, `--github` exits with 4 and
  names both variables, before any request.
- **`--login`** names the user to load; without it the token's owner is loaded. An app token (the Actions
  `GITHUB_TOKEN`, an installation token) belongs to no user and needs `--login`
  ([data-github.md](data-github.md#cache), `invalid-option` otherwise). An invalid login fails `invalid-option`.
- **Order**: `render` and `validate` load the data after the design file and its assets: a design that fails to load
  (exit code 1 or 3) costs no request and is reported before a missing or refused token (exit code 4). `preview` loads
  the data first, before it reads the design or starts serving: a missing token or a failed load exits with 4 at once,
  and a design error is then shown on the page like any later one.
- **Requests**: a load sends the requests of [data-github.md](data-github.md#rate-limits) (at most 6 with `--login`
  and 7 without it, plus retries; fewer for a user with fewer repositories), only to `https://api.github.com/graphql`, and takes at most 300 s in all, retries and
  rate-limit waits included. There is no cache and nothing is written to disk.
- **Incomplete data**: when GitHub refuses the activity or the weekly-commit request (a token that may not read the
  profile status or the pinned items, as the Actions `GITHUB_TOKEN` may not), the load still succeeds with those
  fields empty and the CLI prints one line on standard error, `warning: GitHub data is incomplete (activity, weeks): ...`, naming the parts and the fields they leave empty
  ([data-github.md](data-github.md#pinned-repositories-pushes-and-status)). Standard output and the exit code are not
  affected.
- **Errors**: a failed load is one line `GitHub data (<code>): <message>`, its code one of the `GitHubDataError` codes
  of [data-github.md](data-github.md#errors) (`unauthorized`, `rate-limited`, `network`, ...), exit code 4.
- **`preview`** loads the data once, before it starts serving; editing the design or an asset never
  loads it again. Restart the preview for fresh data. Ctrl+C during the load ends it with exit code 0. The page and the
  render are then served only under the secret address it prints, `http://127.0.0.1:<port>/<secret>/` (see
  [Preview](#preview)). Each run prints a new address: a tab left open from an earlier run shows "forbidden: open the
  address the preview printed" and must be reopened at the new one.
- **Images** bound to the data (`--fetch-images`) are fetched with their own requests, which never carry the token or
  another credential.
- **Never printed**: the token is redacted to `***` from every line on standard error and on the preview page (the
  values of `GH_TOKEN` and `GITHUB_TOKEN` as set and trimmed, their base64 forms and the base64 of the
  `x-access-token:` credential), whatever the command and options; this is the only use of the variables without
  `--github`. Standard output (the SVG, `<design>: ok`) is never altered.

## JSON data

`--data-json` binds any JSON document under a namespace of your choice, with the `@readmint/data-json` source of
[data-sources.md](data-sources.md#the-json-source):

```sh
readmint render design.json --data-json stats=data/stats.json --out card.svg
API_KEY=<key> readmint render design.json --data-json api=https://api.example.com/v1/stats \
  --data-json-header api:X-Api-Key=API_KEY --out card.svg
```

- **The argument** is `<ns>=<source>`, or just `<source>` for the namespace `json`. `<ns>=` is taken only when it is a
  valid namespace, so a URL with `=` in its query is one source under `json`.
- **The data object** is `{ version: 0, document: <the parsed JSON> }`, whatever the document is (object, array or
  value): bind `stats.document.stars`. A `version` of the document stays at `document.version`.
- **A file** is a relative path inside `--root` (default the current folder), at most 1 MiB. Unlike the design, `--data` and `--props` paths, which are relative to the current folder, it is resolved against `--root`, as in the Action: with `--root card`, write `--data-json s=s.json` for `card/s.json`, not `card/s.json` (that looks for `card/card/s.json`). Rules: no `..`, no absolute,
  drive-letter, UNC or device path, and a link or junction that leads outside the root is refused.
- **A URL** must be `https://` (no user name or password); at most 3 redirects, each to https, a JSON (or
  `text/plain`) content type in UTF-8, 1 MiB and 10 s for the whole load. No other scheme is fetched.
- **Headers** (`--data-json-header`) are read from the environment by name, never from an argument; they are sent only
  to the origin of the source URL (a redirect to another origin drops them). Their values are redacted to `***` from
  every line on standard error and on the preview page, like the token.
- **Order**: sources load one after another in argument order, after the design, its assets and the GitHub data. A
  failed load is one line `JSON data <ns> (<code>): <message>`, exit code 4, its code one of the common data source
  codes (`not-found`, `forbidden`, `too-large`, `timeout`, `invalid-response`, ...).
- **Merging**: with `--data` the fixture file is read first and the JSON namespaces are added to it; a fixture key equal
  to a JSON namespace is exit code 3. With `--github` the namespace `github` is reserved (exit code 2).
- **`preview`** loads the JSON data once before it starts serving, like `--github`, and serves under the secret
  address; restart it for fresh data. The fixture file is still read again on every change.
- **Determinism**: the same document gives the same data object, so the same SVG bytes, from a file or a URL.

## Feed data

`--data-feed` binds the latest entries of an RSS 2.0 or Atom 1.0 feed (blog posts, release notes) under a namespace of
your choice, with the `@readmint/data-feed` source of [data-sources.md](data-sources.md#the-feed-source):

```sh
readmint render design.json --data-feed blog=https://blog.example/feed.xml --data-feed-limit blog=3 --out card.svg
```

- **The argument** is `<ns>=<url>`, or just `<url>` for the namespace `feed`. `<ns>=` is taken only when it is a valid
  namespace, so a URL with `=` in its query is one feed under `feed`. `--data-feed-limit <ns>=<n>` keeps `n` entries
  (1 to 50, default 5) of that feed.
- **The data object** is `{ version: 0, title, link, entries }`, each entry `{ title, link, published, summary }` in
  plain text, newest first: bind `blog.entries[0].title`.
- **A URL** must be `https://` (no user name or password), at most 3 redirects, an XML or `text/plain` content type,
  1 MiB and 10 s; the request carries no credentials. The URL may hold a key, so no message, line or the preview page
  ever shows it: problems name the namespace only.
- **Order**: feeds load one after another in argument order, after the GitHub and JSON data. A failed load is one line
  `Feed data <ns> (<code>): <message>`, exit code 4.
- **Merging**: the feed namespaces are added to `--data` or `--github` data; a fixture key equal to a feed namespace is
  exit code 3; with `--github` the namespace `github` is reserved, and a namespace cannot be both a feed and a
  `--data-json` source (exit code 2).
- **`preview`** loads the feeds once before it starts serving, under the secret address, like `--github`.

## Preview

`readmint preview` prints `preview: http://127.0.0.1:<port>/` and serves the render until it is stopped (Ctrl+C
or SIGTERM, exit code 0). With `--github`, `--data-json` or `--data-feed` it prints `preview: http://127.0.0.1:<port>/<secret>/` instead: open that
address. The page shows the SVG exactly as `render` writes it and the current issues. Every 300 ms it checks the
design file, the fixture data and every asset file the design declares (also one that does not exist yet). A change
counts once it reads the same on two consecutive checks, so the preview renders again up to about 600 ms after a save
and the page reloads; a file still being written is not rendered half done, and a file that changes on every check is
not rendered until it stops changing. A save that lands while a file is being read (an editor writing a temporary
file and renaming it over the design or an asset) is read again, up to four reads about 150 ms apart in all, before
"changed while it was being read" is shown. A render that fails keeps the last good SVG and shows the issues.

The preview is for this computer only:

- it listens on the literal address `127.0.0.1`, never on another interface, and has no host option;
- it answers 403 unless the `Host` header is `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding), to a request
  a browser marks as coming from another site (`Sec-Fetch-Site`), and to one whose `Origin` header, when sent, is not
  `http://127.0.0.1:<port>` or `http://localhost:<port>` (`null` included);
- with `--github`, `--data-json` or `--data-feed` the page shows loaded data that may be scoped to a token, a header or a feed URL's key, so every route lives under a per-session secret: 256 random bits
  (43 characters), new on each run, kept in memory only and never shown on the page, in `/status` or in an error.
  Any path that does not begin with exactly `/<secret>/` is 403, checked before the method and before the limit of
  pages below. The one exception is the one-time launch address of `--open`: `/<launch>`, another 43 random
  characters, answers its first GET with a 303 redirect to `/<secret>/`, and from then on (to any other method, and
  after the first use of the secret address) like any other path, 403. This keeps out other users of the computer, their processes and other sites; a process of your own
  user that can read your terminal or your environment can read the token itself, which no address can prevent;
- it serves a fixed set of routes from memory (`/`, `/render.svg`, `/status`, `/events`, with `--github` each under
  `/<secret>`), never a file: any other path is 404, any method but GET and HEAD 405;
- the SVG is served with a Content Security Policy that allows only inline styles and `data:` images and fonts, the page
  with one that allows only its own script and requests;
- at most 8 pages can follow the changes at once; a ninth event stream is refused with 503;
- with `--open` and a secret path (`--github`, `--data-json` or `--data-feed`) the opener and the browser get only the one-time launch address, never the secret one: on
  Linux and macOS other users of the computer can read a running process's command line, and the launch address it
  shows is spent once the browser has used it or the secret address has been used. Another user who reads it and uses it first gets in, and your browser
  then shows the forbidden hint: stop the preview and start it again, which makes a new secret. On a shared computer,
  copying the printed address into the browser leaves nothing on any command line. If the first open already shows
  the forbidden hint (some openers fetch the address themselves before starting the browser), open the printed address
  instead. When the spent launch address is requested again, the preview prints one warning line on standard error
  (once per run; it holds neither the address nor the token) and the reply stays the same 403.

Without `--open` nothing is opened. With it the address (with `--github`, `--data-json` or `--data-feed` the one-time launch address, which leads to
the printed one) opens in the default browser right after it is printed. If the
opener itself cannot be started (for example no `xdg-open`), the preview prints `preview: cannot open a browser; open the
address above` (with the system error code in parentheses when there is one), keeps serving, and the exit code is
unchanged. An opener that starts but then fails (no desktop session, no browser) is not detected: copy the printed
address. On Windows the opener is started by its full path under `SystemRoot` (default `C:\Windows`), never found
through the current folder. The opener's own output is discarded, and an opener that hangs does not delay Ctrl+C.

A port in use, or one the system refuses, is exit code 3.

## Programmatic use

`@readmint/cli` exports `runCli(argv, io)` (returns the exit code, never throws; `CliIo.openUrl` opens the `preview --open` address (with `--github`, `--data-json` or `--data-feed` the one-time launch address), the platform's opener when absent; `CliIo.env` is the environment `--github` takes its token
from, `bin` passes `process.env`), `ExitCode`, `CliError`, `CliIo`,
`escapeForLog`, `quoteForLog`, `formatIssue`, `localeProblem(locale)` (why a tag cannot be the `--locale`, `undefined` when it can; the Action's `locale` input uses it too), `outputFormats` and `outputExtension(format)` (the `OutputFormat`s and their file extension, `apng` → `png`), and the loaders the commands share: `loadDesignFile`, `loadDesignAssets`,
`loadFixtureData` (with `maxFixtureBytes`, its size cap), `loadDesignProps(file, cwd)` (the `--props` settings file, a `DesignProps` of `@readmint/format`; whose `props` in `RenderInputOptions` stands in for `--props`) and `propsSection(fileName)` (the section a design file takes; it lives in `@readmint/format`, which the editor uses too), `loadLiveData` (the `--github` load: `LiveDataOptions` with
`token`, `login`, `fetch`, `signal` and `onPartial`, at most `liveDataTimeoutMs`; a failure is a `CliError` with exit code 4),
`parseDataJsonArgs(sources, headers)` (the `--data-json` and `--data-json-header` texts as `DataJsonSpec`s, or the
problems; at most `maxDataJsonSources`), `loadJsonArgs(specs, options)` (the `--data-json` load, `JsonArgsOptions` with
`root`, `fetch`, `env` and `signal`; a failure is a `CliError` with exit code 4), `parseDataFeedArgs(sources, limits)` (the `--data-feed` and `--data-feed-limit` texts as `DataFeedSpec`s, or the
problems; at most `maxDataFeedSources`), `loadFeedArgs(specs, options)` (the `--data-feed` load, `FeedArgsOptions` with
`fetch` and `signal`; a failure is a `CliError` with exit code 4), `mergeDataNamespaces(fixture, loaded)`
(adds loaded namespaces to fixture data; a clash is a `CliError` with exit code 3),
`partialDataWarning(parts)` (the one warning line for `meta.partial`, also the Action's),
`redactSecrets(text, secrets)` (the redaction of standard error, also the Action's log), `loadRenderInput` (design file, assets, fixture data and the images bound to data in one call; `RenderInput`,
`RenderInputOptions`, whose `images` fetches them, whose `data` stands in for `--data`, and whose `loadData` loads it
once the design and its assets are valid, as `--github` does), `fetchBoundImages` and its
`RemoteImageError`, `RemoteImageOptions`, `defaultImageHosts` and `RemoteImageLimits` (see
[asset-loading.md](asset-loading.md#images-bound-from-data)), `renderInput` (`renderSvg` of a loaded input with the renderer's default limits) and `renderOutput(input, formats,
options)` (one render, then each format: the SVG, or `exportRaster` of it; a raster failure is a `CliError` with exit code
1). The GitHub Action ([action.md](action.md)) renders through `loadRenderInput` and `renderOutput`, so it writes the
bytes `readmint render` writes.
