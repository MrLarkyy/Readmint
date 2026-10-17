# Pinscreen

An editor-style profile in Geist and Geist Mono, with IntelliJ Light and Darcula syntax colours. The year is a 3D wall of pins, one a day, with a ripple running out from today; the repositories are Kotlin objects, recent commits a terminal `git log`, and the stack a `build.gradle.kts`. Geist and Geist Mono cover Latin, most of Latin Extended-A, Vietnamese and Cyrillic; Noto Sans and Noto Sans Mono, their fallbacks, draw the rest of Latin Extended-A, Cyrillic and Greek. Emoji and CJK are not drawn.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/pinscreen/` in your profile repository.
2. Fill in your texts once in `settings.json` (below): they apply to every section, light and dark.
3. Add the workflow below. Only the light designs are listed; the Action finds each `.dark.json` next to its light
   design and writes both, and `props-file` merges your texts from `settings.json` into each of them.
4. Paste the snippet below into your profile `README.md`, with your own login and repository addresses.

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
            readmint/designs/pinscreen/header.json
            readmint/designs/pinscreen/year.json
            readmint/designs/pinscreen/work.json
            readmint/designs/pinscreen/repo-1.json
            readmint/designs/pinscreen/repo-2.json
            readmint/designs/pinscreen/repo-3.json
            readmint/designs/pinscreen/repo-4.json
            readmint/designs/pinscreen/repo-5.json
            readmint/designs/pinscreen/repo-6.json
            readmint/designs/pinscreen/log.json
            readmint/designs/pinscreen/stack.json
            readmint/designs/pinscreen/footer.json
          props-file: readmint/designs/pinscreen/settings.json
```

The repository cards show `github.pinned` in the order the data gives, or `github.repositories` where the data has no pinned list (the loader fills `github.pinned`). Change which repository a card shows by changing the root prop `slot` of its design (0 to 5).

The sections `header`, `log`, `repo-1` to `repo-6`, `stack` and `year` bind values with the layer property `let`, which needs the Action v0.4.0 or newer; an older Action refuses them with `unknown-property`.

## Your texts

The personal texts are set once, in `settings.json` next to the designs: an object with one entry per section (the
design's file name without `.json` and `.dark`), each holding that section's props. The Action input `props-file`
(CLI: `--props`) merges a section's props into the root component of its light design **and** its `.dark` twin, so
you write every text once. They are empty in this folder, and an empty text hides its block; the file lists every
prop of every section that has one, at its component default. Delete what you do not use, a prop left out keeps the
design's own value. A value in `settings.json` wins over the same prop written in a design, an unknown section
is ignored by the CLI and warned about by the Action, and a prop a section does not have fails the render. `theme`
stays in the design (it is what makes the twin dark); `slot` of the repository sections may be set in either.

| section  | prop             | type   | what it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | example                                         |
| -------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `header` | `role`           | string | the line under the name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `Developer. Tools and infrastructure.`          |
| `header` | `intro`          | string | the line under it; empty: the GitHub bio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `I build developer tools and write about them.` |
| `header` | `branch`         | string | the branch in the status bar; default main                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `main`                                          |
| `header` | `statusBarRight` | string | the right end of the status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `TypeScript · LF · UTF-8`                       |
| `stack`  | `languageShare`  | enum   | `bytes` (default): the languages by bytes of code; `repositories`: the per-repository weighted share (each repository counts once, split over its languages by bytes, then averaged), so one large repository does not dominate; falls back to bytes without `github.languagesByRepo`; `authored`: the lines you added per language in your own newest commits (needs the loader option `languageCommitCap`, CLI `--language-commit-cap`, Action `language-commit-cap`), falls back to bytes while `github.languagesAuthored` is empty | `repositories`                                  |
| `stack`  | `plugin`         | string | the plugins block; empty: no block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `kotlin("jvm")`                                 |
| `stack`  | `labels`         | array  | a comment per dependency line, up to four                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `["tools", "data"]`                             |
| `stack`  | `items`          | array  | the dependencies of each line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `["git, make", "sqlite"]`                       |
| `stack`  | `noteLabels`     | array  | comment lines at the end, up to three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `["editor"]`                                    |
| `stack`  | `noteItems`      | array  | their texts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `["Neovim"]`                                    |
| `stack`  | `logoFills`      | array  | the fill of each layer, `#RRGGBB`, at the index of `logoLayers`; empty: the comment colour                                                                                                                                                                                                                                                                                                                                                                                                                                             | `["", "#E5484D"]`                               |
| `stack`  | `logoFillsDark`  | array  | the same for the dark design, read first; empty: `logoFills`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `["", "#FF6369"]`                               |
| `stack`  | `logoLabels`     | array  | a caption per card line, up to four; empty: a continued line                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `["now", "before"]`                             |
| `stack`  | `logoLayers`     | array  | 4 path layers per name (name k: 4k to 4k+3), bottom to top; empty: `logos`, then the name                                                                                                                                                                                                                                                                                                                                                                                                                                              | `["M0 0h14v14H0Z", "", "", ""]`                 |
| `stack`  | `logoLines`      | array  | the line (0 to 3) of each name, a number or its text; none: the first                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `["0", "1"]`                                    |
| `stack`  | `logoNames`      | array  | project names; each is drawn as its logo, as text, or both, in a card                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `["Example"]`                                   |
| `stack`  | `logoWithName`   | array  | a name per logo: any text draws the name next to it; empty: the logo replaces it                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `["1"]`                                         |
| `stack`  | `logos`          | array  | one ink path per name (no layers), the old form; unused where `logoLayers` has an entry                                                                                                                                                                                                                                                                                                                                                                                                                                                | `["M0 0h14v14H0Z"]`                             |
| `stack`  | `logosRow`       | number | the index of the note line the card follows; default -1: none                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `1`                                             |
| `footer` | `headline`       | string | the closing line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: github                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `hello@example.com`                             |

The stack is as tall as its build file, up to fifteen lines, and never shorter than its languages panel, so a short
file leaves no empty space below it. The note line named by `logosRow` keeps its label and is followed by a card of up to four code lines, each a comment with its caption from `logoLabels` (a line whose caption is empty continues the one above; with no caption at all the names start at the left) and the names whose `logoLines` entry is that line's number. A name is drawn as its colour logo: `logoLayers` holds 4 path slots per name (name k at 4k to 4k+3, painted bottom to top; each path with its origin at 0 0, 14 px tall, absolute `M`/`L`/`C`/`Z`; slot 0 is the whole silhouette and each later slot what the next colour covers, so the colours leave no seam; at most 6000 characters of path data for the layers of one name), each filled with the `#RRGGBB` at the same index of `logoFills` and, in the dark design, of `logoFillsDark` first; an empty fill draws in the comment colour, so a neutral part follows the theme and a brand colour keeps its hue (keep each fill at 2:1 contrast with the panel in both designs, or give the dark design its own). A name with `logoWithName` set is drawn next to its logo (an icon); without it the logo replaces the name (a wordmark). A name without layers uses the old single ink path of `logos`, else it is drawn as text. The fills must be colours: any other text makes the render fail and writes nothing of it. Every card line is one code line (19 at most); at most 12 names are drawn and a line is cut at the panel edge. Without `logoNames` or with `logosRow` outside the note lines the line shows its text.

For example, `settings.json` for the `header` section:

```json
{
  "header": {
    "role": "Developer. Tools and infrastructure.",
    "intro": "I build developer tools and write about them.",
    "branch": "main",
    "statusBarRight": "TypeScript · LF · UTF-8"
  }
}
```

To render one section by hand: `readmint render header.json --props settings.json --data data.json`.

## The README

SVG links do not work inside an `<img>`, so each repository and the contact footer sit in a link around the image. The repository cards sit two to a row, as two linked images of 49 % width.

<!-- prettier-ignore -->
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/header.dark.svg">
  <img alt="Profile header" src="readmint/header.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/year.dark.svg">
  <img alt="The last twelve months as a pinscreen" src="readmint/year.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/work.dark.svg">
  <img alt="Selected work" src="readmint/work.svg">
</picture>

<p>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-1">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-1.dark.svg">
  <img alt="Repository 1" src="readmint/repo-1.svg" width="49%">
</picture>
</a>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-2">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-2.dark.svg">
  <img alt="Repository 2" src="readmint/repo-2.svg" width="49%">
</picture>
</a>
</p>

<p>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-3">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-3.dark.svg">
  <img alt="Repository 3" src="readmint/repo-3.svg" width="49%">
</picture>
</a>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-4">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-4.dark.svg">
  <img alt="Repository 4" src="readmint/repo-4.svg" width="49%">
</picture>
</a>
</p>

<p>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-5">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-5.dark.svg">
  <img alt="Repository 5" src="readmint/repo-5.svg" width="49%">
</picture>
</a>
<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-6">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-6.dark.svg">
  <img alt="Repository 6" src="readmint/repo-6.svg" width="49%">
</picture>
</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/log.dark.svg">
  <img alt="Recent commits" src="readmint/log.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/stack.dark.svg">
  <img alt="Stack" src="readmint/stack.svg">
</picture>

<a href="https://github.com/YOUR-LOGIN">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/footer.dark.svg">
  <img alt="Contact" src="readmint/footer.svg">
</picture>
</a>
```

## Data

Every section reads the `github.*` object of the [GitHub data source](https://github.com/MrLarkyy/Readmint/wiki/GitHub-data). The loader provides
`github.status`, `github.pushes[]` and `github.pinned[]` with `weeklyCommits[52]`. A design reads them as optional (a
missing property is `null`) and shows a plain line where they are missing, for instance when the token cannot read
them (the Actions `GITHUB_TOKEN` may not read the status); without `github.pinned` the repository slots show
`github.repositories`.
The [Components and templates](https://github.com/MrLarkyy/Readmint/wiki/Components-and-templates#profile-templates) page lists the fields and their shape.

## Motion

The ripple runs through the pins every nine seconds, the status dot pulses and the carets blink; the repositories' code lines and the stack's language bars appear once. The header and the git log loop every 60 seconds and the year every 54 seconds (six ripples), so their one-shots replay once per loop: the push types itself out again, the git log prints again and the total counts up again. A PNG export and a reader who asks for less motion see the final state. Raster exports of the 54 and 60 second loops are sampled at the highest frame rate the raster limits allow (docs/raster.md, "The default frame rate"), not 30; the loops themselves are not shortened, and the rate drops further where the file would pass 5 MiB (table in docs/components.md, "Raster export of the long loops").
