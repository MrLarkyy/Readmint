# GitHub Action

The Readmint Action renders your designs in your own repository, on a schedule or on demand, and commits the SVG (or PNG, WebP,
APNG, GIF) files that changed. It uses the same loaders and renderer as `readmint render` ([cli.md](cli.md)): for the same design,
assets and data the Action writes byte for byte what the CLI prints.

## Example workflow

```yaml
name: Readmint

on:
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: readmint
  cancel-in-progress: false

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: MrLarkyy/Readmint@vX.Y.Z
        with:
          designs: |
            readmint/designs/card.yaml
            readmint/designs/languages.yaml
```

Use an exact release tag (`vX.Y.Z`); see [Releases](#releases). The [examples repository](https://github.com/MrLarkyy/readmint-template-test) runs the profile
templates as working workflows ([components.md](components.md#the-examples-repository)). Then put the printed snippet (below) into your README.

## Inputs

| input                  | default                          | meaning                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `designs`              | (required)                       | design files, one per line, relative to the workspace; blank lines are ignored; 1 to 64                                                                                                                                                                                                                                          |
| `output-dir`           | `readmint`                       | folder inside the workspace the output files go to; created when missing                                                                                                                                                                                                                                                         |
| `formats`              | `svg`                            | output formats, comma or newline separated: `svg`, `png`, `webp`, `apng`, `gif` (see [raster.md](raster.md)); each design is written once per format; the first one is what the snippet shows; `png` and `apng` together are an input error (both write `.png`)                                                                  |
| `scale`                | `2`                              | raster pixels per design pixel, 1..4 (up to three decimals), as the CLI `--scale`                                                                                                                                                                                                                                                |
| `frame-rate`           | none                             | frames per second of an animated raster output, a whole number in 1..60 (1..50 when `gif` is listed), as the CLI `--frame-rate`; none: 30, `gif` 25                                                                                                                                                                              |
| `quality`              | none                             | lossy WebP at this quality, a whole number in 1..100, as the CLI `--quality`; `webp` must be listed in `formats`; none: lossless                                                                                                                                                                                                 |
| `token`                | `${{ github.token }}`            | token for the GitHub data; not used with `data-file`; never printed and never given to git                                                                                                                                                                                                                                       |
| `login`                | `${{ github.repository_owner }}` | the GitHub user whose data is loaded; needed with `GITHUB_TOKEN`, which belongs to no user                                                                                                                                                                                                                                       |
| `exclude-repositories` | none                             | repositories (`name` or `owner/name`, separated by commas or lines) left out of the GitHub repository list, stars, forks, languages and pinned fallback (not the repository total, pushes or the calendar), as the CLI `--exclude-repositories`; not with `data-file`                                                            |
| `data-file`            | none                             | fixture data JSON (the CLI `--data` format) used instead of loading GitHub data: no token, no GitHub API (only images bound to data are fetched); a path relative to the workspace, checked like `designs` and `data-json` files (no `..`, no absolute or drive path, a link or junction leading outside refused), at most 8 MiB |
| `data-json`            | none                             | JSON documents to bind, one per line as `[<namespace>=]<source>` (the CLI [`--data-json`](cli.md#json-data)): a file inside the workspace or an https URL, each bound as `{ version: 0, document }` under its namespace (default `json`), at most 8, added to the `data-file` or GitHub data ([JSON data](#json-data))           |
| `data-json-headers`    | none                             | headers for the `data-json` URLs, one per line as `<namespace>:<Header-Name>=<ENV_NAME>`: the value is read from the step's environment variable `ENV_NAME`, masked, never printed and sent only to that URL's origin                                                                                                            |
| `data-feed`            | none                             | RSS 2.0 or Atom 1.0 feeds to bind, one per line as `[<namespace>=]<https URL>` (the CLI [`--data-feed`](cli.md#feed-data)): each is bound as `{ version: 0, title, link, entries }` under its namespace (default `feed`), at most 8, added after the `data-json` documents ([Feed data](#feed-data))                             |
| `data-feed-limits`     | none                             | entries kept per feed, one per line as `<namespace>=<n>` with n from 1 to 50 (the CLI `--data-feed-limit`); a feed without a line keeps 5                                                                                                                                                                                        |
| `props-file`           | none                             | settings JSON file (the CLI [`--props`](cli.md#settings-file) format: root component props by section) merged into every listed design and its dark twin, so personal texts are set once per template; a section no listed design has is warned about, without its values                                                        |
| `locale`               | none                             | BCP 47 tag for the `number`, `compact`, `percent` and `date` filters, checked as the CLI `--locale` (`en`, `de`, `fr`, `es`, `cs` or a region tag of one); none: the design's `locale`, else `en`                                                                                                                                |
| `commit-message`       | `Update Readmint graphics`       | message of the commit; at most 4096 characters                                                                                                                                                                                                                                                                                   |
| `branch`               | the checked-out branch           | branch the commit is pushed to, without `refs/`; the checkout must be this branch at its latest commit on `origin` (see [Pushing](#pushing))                                                                                                                                                                                     |
| `dry-run`              | `false`                          | `true` renders and writes the files but runs no git command                                                                                                                                                                                                                                                                      |

Booleans are YAML core booleans: `true`, `True`, `TRUE`, `false`, `False`, `FALSE`. A blank input takes its default.
Every problem with the inputs is reported at once, before anything is rendered.

## Outputs

| output    | value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `changed` | `true` when an output file differs from the last commit (in a dry run: when a file in the workspace changed) |
| `commit`  | SHA of the pushed commit; empty when nothing was committed and in a dry run                                  |
| `files`   | the changed output files, one per line, relative to the workspace                                            |
| `snippet` | the `<picture>` HTML for every design, also printed in the log group `README snippet`                        |

## Outputs on disk and the dark variant

A design `card.yaml` is written to `<output-dir>/card.svg`: the file name without its last extension, plus the extension
of each format (`.svg`, `.png`, `.webp`, `.gif`; `apng` writes `.png`). Two designs that would write the same file
(also when only the letter case differs) are an input error.

A design file `card.dark.yaml` next to `card.yaml` (same folder, same extension) is its dark variant: it is rendered
too, to `<output-dir>/card.dark.svg`, and the snippet switches to it when the reader's system is in dark mode. It is a
design like any other; nothing in the design format or the renderer knows about light or dark. You do not need to
list it; if you do, list its light design too, else it is an input error.

<!-- prettier-ignore -->
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/card.dark.svg">
  <img alt="card" src="readmint/card.svg">
</picture>
```

Paths in the snippet are relative to the repository root (where the README is), each segment percent-encoded. The
snippet shows the first listed format; when that is a raster format, the `<img>` carries the design's `width` and
`height` in CSS pixels, so an image exported at `scale` 2 shows sharp at the design's size:

<!-- prettier-ignore -->
```text
<img alt="card" src="readmint/card.png" width="420" height="120">
```

Outputs of designs you remove from the list are not deleted.

## What a run does

1. Reads and checks the inputs, then pairs the designs with their outputs and loads the `props-file`, so a bad
   settings file or a section no design has is reported before any git check or GitHub request.
2. Unless it is a dry run: finds the branch to push to, checks its name and that the checkout is that branch's latest
   commit on `origin`, before anything is written.
3. Loads the data once: the `data-file`, else the GitHub data of `login`, bound as `github` (see
   [data-github.md](data-github.md)). The load is given 5 minutes. Then each `data-json` source in the listed order,
   added under its namespace ([JSON data](#json-data)), then each `data-feed` feed ([Feed data](#feed-data)).
4. Loads and renders every design and dark variant, in every listed format (a raster export samples an animated design
   at `frame-rate` and stays within the limits of [raster.md](raster.md)). Design files and their assets are read only inside the workspace,
   also through links ([asset-loading.md](asset-loading.md)). If any design fails, nothing is written and the run
   fails: the output set is never half updated.
5. Writes each output whose bytes differ from the file already there (a file with the same bytes is not touched).
   The output folder must resolve inside the workspace and an existing output must be a regular file, not a link or a
   folder; this is checked before the first write.
6. Prints the snippet.
7. Unless it is a dry run: stages the output files and, when any differs from the last commit, commits only those
   files (anything else you staged in an earlier step stays staged and out of the commit) as `github-actions[bot]`
   and pushes the commit to `origin`. A second run over unchanged designs and data makes no commit.

Renderer warnings are printed as `::warning::` lines and do not fail the run.

## Settings file

`props-file` names a JSON file, a path relative to the workspace that is not restricted to it, `{ "<section>": { "<prop>": value } }`, read once before any git
command or GitHub request. The section of a design is its file name without the extension and without `.dark`, so a light design and its
dark twin share the entry, and the output is the same as the CLI `readmint render <design> --props <file>` gives
([cli.md](cli.md#settings-file)). A section no listed design has is a `::warning::` line naming the section only; a
file that cannot be read or is invalid, or a prop a design does not declare or a wrongly typed value, fails the run
before anything is written, with the section and prop in the message, never the value; a render error at a set prop, or
inside its component with the value in the message, keeps its path but its message names only the section and props.

## Data and the token

By default the Action loads the data of the repository owner with the workflow's `GITHUB_TOKEN`. That token belongs
to no user, so `login` is needed (its default is the repository owner) and the data is what the token may see. With a
personal access token in a secret (`token: ${{ secrets.READMINT_TOKEN }}`), the data can include contribution counts
of private repositories; in a public repository they are then published in the SVG. See
[data-github.md](data-github.md#repositories-and-privacy) before you use a personal token. The owner must be a user;
an organisation login fails to load.

The profile status, the pinned repositories, the recent pushes and the weekly commits (`github.status`, `github.pinned`,
`github.pushes`) come from two extra requests. A token that may not read them leaves those fields empty and the
templates show their plain fallback lines; the run goes on and the log gets one `::warning::` line naming the missing parts (never the token). Private repositories never appear in them, with any token
([data-github.md](data-github.md#pinned-repositories-pushes-and-status)).

The token is used for the GitHub data only. It is never printed: log lines, errors and step outputs are redacted (also
its base64 forms), and the GitHub loader never puts it into an error. It is never given to git, neither as an
argument nor in git's environment, and never sent to an image host.

A design whose image `src` is bound to data (`"{{ github.avatarUrl }}"`) has that image fetched before the render,
in both data modes, with its own request: no token, cookie or other credential, no redirect, https on an allowed host
only (`avatars.githubusercontent.com`), each URL once per run (so a dark twin shares the fetch), at most 32. The bytes
are inlined in the SVG. The rules and error codes: [asset-loading.md](asset-loading.md#images-bound-from-data).

## JSON data

`data-json` binds any JSON document, a file in the repository or a public https URL, with the JSON source of
[data-sources.md](data-sources.md#the-json-source), the load `readmint --data-json` uses:

```yaml
- uses: MrLarkyy/Readmint@vX.Y.Z
  env:
    STATS_API_KEY: ${{ secrets.STATS_API_KEY }}
  with:
    designs: readmint/designs/card.yaml
    data-json: |
      counts=readmint/counts.json
      api=https://api.example.com/v1/stats
    data-json-headers: |
      api:X-Api-Key=STATS_API_KEY
```

- Each document is bound as `{ version: 0, document: <the parsed JSON> }` under its namespace: bind
  `counts.document.stars`. Without `<namespace>=` the namespace is `json`.
- A file source is a path relative to the workspace, checked like `designs` (no `..`, no absolute or drive path) and
  then by real path: a link or junction that leads outside the workspace is refused. At most 1 MiB.
- A URL must be `https://`; at most 3 redirects (https only), a JSON or `text/plain` content type in UTF-8, 1 MiB, 10 s.
- A header value comes only from the step's environment, by the variable name in `data-json-headers` (set it from a
  secret with `env:`, never in `with:`). The Action registers each value with `::add-mask::` before any load, redacts
  it from every line it prints, and sends it only to the origin of its URL (a redirect to another origin drops it).
- The JSON namespaces are added to the `data-file` data or to `github`: `github` cannot be a JSON namespace unless
  `data-file` is given, and a `data-file` key equal to a JSON namespace fails the run, naming it.
- The documents are loaded on every run (no cache); the same documents give the same bytes.

## Feed data

`data-feed` binds the latest entries of an RSS 2.0 or Atom 1.0 feed, a public https URL, with the feed source of
[data-sources.md](data-sources.md#the-feed-source), the load `readmint --data-feed` uses:

```yaml
- uses: MrLarkyy/Readmint@vX.Y.Z
  with:
    designs: readmint/designs/card.yaml
    data-feed: |
      blog=https://blog.example/feed.xml
    data-feed-limits: |
      blog=3
```

- Each feed is bound as `{ version: 0, title, link, entries }` under its namespace, entries as plain text
  `{ title, link, published, summary }` newest first: bind `blog.entries[0].title`. Without `<namespace>=` the namespace
  is `feed`; a limit is 1 to 50 and a feed without one keeps 5.
- A URL must be `https://`; at most 3 redirects (https only), an XML or `text/plain` content type, 1 MiB, 10 s. No
  credentials are sent. A URL that holds a key must come from a secret (`blog=${{ secrets.BLOG_FEED_URL }}`), as a header
  value does: the runner prints `with:` values and masks only secrets. The Action itself never prints a feed URL, and
  errors name the namespace only.
- The feed namespaces are added to the `data-file` data or to `github`, as the JSON ones: `github` cannot be a feed
  namespace unless `data-file` is given, a `data-file` key equal to a feed namespace fails the run, naming it, and a namespace cannot be
  both a `data-json` and a `data-feed` namespace.
- The feeds are loaded on every run (no cache).

## Pushing

The push uses the credentials `actions/checkout` stores in the repository, so:

- keep `persist-credentials` of the checkout on (its default) and give the job `permissions: contents: write`;
- check the repository out into the workspace root (no `path:`), since git works there;
- git must be on `PATH` (every GitHub-hosted runner has it). The Action starts it by the absolute path it finds there,
  skipping relative or empty `PATH` entries and any directory inside the workspace, and git, with the programs it
  starts (remote helpers, ssh, filters, gpg), gets a `PATH` without those entries, so a `git`, `git.exe` or other
  program committed to the repository never runs. The process is started from the directory it was found in, with the
  workspace given by `-C`;
- check out the branch the Action pushes to (the default of `actions/checkout` on a schedule or `workflow_dispatch`
  run): the commit is pushed with the checkout's history, so the Action refuses to run, before writing anything, when
  the checkout is not the latest commit of that branch on `origin` (a detached HEAD, a pull request merge, another
  branch, a branch missing on `origin` or one that moved since the checkout). It never pushes commits nobody merged
  into the branch;
- the push goes to `origin`; a branch that moves between that check and the push rejects the push and the run fails:
  nothing is rebased or forced. A `concurrency` group keeps two runs from racing;
- a push made with `GITHUB_TOKEN` starts no other workflow, so the commit does not trigger your other workflows.

### Windows trust boundary

The Action starts git outside the workspace, but git then works inside it, and so do the programs it starts.
Windows searches the current directory of a program for a DLL after the program directory and the system directories,
so a DLL committed to the repository is loaded only under a name neither of those holds. Git for Windows (checked
with 2.51) loads every DLL it ships from its own directories and its optional system DLLs from System32 only. A git
helper, filter or credential helper you install on a Windows runner is inside that boundary: install it with its
DLLs beside it. Linux and macOS have no current-directory library search, but `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH` and
`DYLD_FALLBACK_LIBRARY_PATH` entries that are empty or relative resolve against it, so the Action removes those and
the entries inside the workspace from them (splitting `LD_LIBRARY_PATH` on `;` as well as `:`, as glibc does); other
loader inputs (such as the rpath of a helper you install) are your trust boundary.

On Windows runners git may convert line ends; a `.gitattributes` line such as `readmint/*.svg -text` keeps the SVG
bytes as written. The Action compares with the last commit after staging, so a line-end conversion alone never
makes a commit.

## Dry run

With `dry-run: true` the Action renders and writes the changed files into the workspace, prints
`dry run: would commit <n> file(s)` and sets the outputs (`commit` empty), but runs no git command at all: nothing is
staged, committed or pushed, and the workspace need not be a git repository. Use it to inspect the result, for
example with `actions/upload-artifact`.

## Errors

A failed run exits with 1 and prints one `::error::` line per problem, each naming what it is about:

- inputs: a missing or invalid input (all at once);
- data: the fixture file's problem, or `GitHub data (<code>): <message>` with the code of
  [data-github.md](data-github.md#errors), or `JSON data <namespace> (<code>): <message>` with a common code of
  [data-sources.md](data-sources.md#the-json-source), `Feed data <namespace> (<code>): <message>` with a common code of [data-sources.md](data-sources.md#the-feed-source), or a namespace both the `data-file` and `data-json` or `data-feed` give, or a `data-file` key equal to a `data-json` or `data-feed` namespace;
- render: the design's issues, as `readmint render` prints them (an image bound to data that cannot be fetched as
  `<design>: error image-<reason> at /assets/images/<id>/src: <message>`), or a raster export over a limit (the
  measured value, the limit and a fix);
- output: an output folder outside the workspace, an output that is not a regular file, a file that cannot be written;
- git: the git command that failed and the last 20 lines of what it printed.

Every line is escaped: a design or data value cannot end the line, start a workflow command or colour the log.
Anything unexpected prints only `internal error (<name>)`.

## Releases

The bundle (`packages/action/dist/action.js`, with the raster WebAssembly modules in `packages/action/dist/wasm/`) is
not in the main branch. The `Release Action` workflow
(`workflow_dispatch` with a `version` such as `v0.1.0`) builds it on `main`, commits it on a detached commit and
pushes a new tag that points there. It never moves or overwrites a tag, so a tag always runs the same code. The
Action is version 0: an added input or output is compatible, a renamed or removed one is a new major version.

Once the tag is pushed, the last step creates the GitHub Release for it with the notes GitHub generates
(`gh release create "$VERSION" --verify-tag --generate-notes --latest --title "$VERSION"`); the workflow token with
`contents: write` is enough, there is no further secret. A run for a tag that exists stops at the tag check before
anything is committed, tagged or published, so neither a tag nor a Release is moved or overwritten. If the Release step
fails after the tag was pushed, the run is red and the tag stays: create the Release by hand with the same command and
`--repo MrLarkyy/Readmint` rather than running the workflow again.

After a release, bump `defaultActionRef` (`packages/examples/src/defaultActionRef.ts`) to the new tag, the literal
in [components](components.md#the-examples-repository) ("by default") and the pin in
`packages/examples/test/buildExamples.test.ts`, add any filter the release introduced to
`filterIntroducedIn` (`packages/examples/src/assertActionSupportsDesigns.ts`; a design property goes into
`propertyIntroducedIn` there with the change that adds it to the format), check that every
`propertyIntroducedIn` version names a tag actually cut (`maxLines`: v0.4.0; correct it if that release got another
number), remove the "need the v0.4.0 tag" passage of [components](components.md#the-examples-repository) once the
default reaches it, run `pnpm examples <clone>` and push the clone: the generated example workflows pin that tag.
