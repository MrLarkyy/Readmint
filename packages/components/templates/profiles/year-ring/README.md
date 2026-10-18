# Year Ring

A calm, cobalt profile set in Archivo. The year is a slowly turning 3D ring with a line for every day, as tall as the square root of its commits, the longest streak (a run of two or more days) marked along its base and the total counted up in its middle. The row under the ring names only what is drawn: no busiest weekday for a year without contributions, no streak for a single day, no legend for a calendar without days. The repositories draw their own 52-week lines. Archivo covers Latin, Latin Extended-A and Vietnamese (of Greek only Δ, Ω, μ and π) and Noto Sans, its fallback, Cyrillic and Greek; emoji and CJK are not drawn.

Every section is a design of the public design format, one file each (`<section>.json`; the six repository cards share
`repo.json`). `renders.json`, a render manifest, names the renders, sets the `slot` of each repository card and
gives every render a dark variant (the root prop `theme` set to `dark`), so the light and the dark look come from the same
file. Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/year-ring/` in your profile repository.
2. Fill in your texts once in `settings.json` (below): they apply to every section, light and dark.
3. Add the workflow below. It names `renders.json` with `manifest` (Action v0.4.0 or newer); the Action renders every entry light and dark, and
   `props-file` merges your texts from `settings.json` into each of them. A workflow copied from an earlier version of
   this README lists the designs with `designs:` (and `repo-2.json` to `repo-6.json`, `.dark.json` twins that no longer
   exist): replace that list with `manifest: readmint/designs/year-ring/renders.json`.
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
          manifest: readmint/designs/year-ring/renders.json
          props-file: readmint/designs/year-ring/settings.json
```

The repository cards cap their description at two lines with the text property `maxLines`, and the sections bind
values with the layer property `let` (`header`, `index`, `recent`, `repo-1` to `repo-6`, `year`) or draw with `orbit`
(`header`, `year`); all need the Action v0.4.0 or newer, an older Action refuses them with `unknown-property`. The `index` section also uses the filters `exclude` and `sum` (the prop `languagesHide`) and needs the Action v0.5.0 or newer; an older Action refuses it even with an empty list.

The repository slots show `github.pinned` in the order the data gives, or `github.repositories` where the data has no pinned list (the loader fills `github.pinned`). Change which repository a slot shows by changing its `slot` (0 to 5) in `renders.json`.

## Your texts

The personal texts are set once, in `settings.json` next to the designs: an object with one entry per section (the
render name, which is the section name), each holding that section's props. The Action input `props-file`
(CLI: `--props`) merges a section's props into the root component of the render of that name, light **and** dark, so
you write every text once. They are empty in this folder, and an empty text hides its block; the file lists every
prop of every section that has one, at its component default. Delete what you do not use, a prop left out keeps the
design's own value. A value in `settings.json` wins over the same prop written in a design, an unknown section
is ignored by the CLI and warned about by the Action, and a prop a section does not have fails the render. `theme`
stays in the design (the manifest's dark variant sets it to `dark`); `slot` of the repository sections is set by the
manifest, and a settings section that sets it wins and is warned about by name.

| section  | prop             | type   | what it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | example                                         |
| -------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `header` | `intro`          | string | two lines under the name; empty: the GitHub bio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `I build developer tools and write about them.` |
| `index`  | `labels`         | array  | the row labels, in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `["Focus", "Tools"]`                            |
| `index`  | `values`         | array  | the row texts, one per label                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `["Developer tooling", "Git, Make, Neovim"]`    |
| `index`  | `languageShare`  | enum   | `bytes` (default): the languages by bytes of code; `repositories`: the per-repository weighted share (each repository counts once, split over its languages by bytes, then averaged), so one large repository does not dominate; falls back to bytes without `github.languagesByRepo`; `authored`: the lines you added per language in your own newest commits (needs the loader option `languageCommitCap`, CLI `--language-commit-cap`, Action `language-commit-cap`), falls back to bytes while `github.languagesAuthored` is empty | `repositories`                                  |
| `index`  | `languagesHide`  | array  | language names left out of the languages, exactly as GitHub writes them (`TypeScript`, `Jupyter Notebook`; case counts); the shares of the rest are recomputed to 100 %; empty (default): every language                                                                                                                                                                                                                                                                                                                               |
| `index`  | `languagesAfter` | number | the Languages row (the top three of `languageShare`) comes after this many rows; default 2. A name that does not fit left of the bar is cut with `…` by its drawn width, the share stays                                                                                                                                                                                                                                                                                                                                               | `1`                                             |
| `index`  | `logoFills`      | array  | the fill of each layer, `#RRGGBB`, at the index of `logoLayers`; empty: the ink of the row                                                                                                                                                                                                                                                                                                                                                                                                                                             | `["", "#E5484D"]`                               |
| `index`  | `logoFillsDark`  | array  | the same for the dark design, read first; empty: `logoFills`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `["", "#FF6369"]`                               |
| `index`  | `logoLabels`     | array  | a caption per line of the card, up to four; empty: a line continues the one above                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `["Now", "Before"]`                             |
| `index`  | `logoLayers`     | array  | 4 path layers per name (name k: 4k to 4k+3), bottom to top; empty: `logos`, then the name                                                                                                                                                                                                                                                                                                                                                                                                                                              | `["M0 0h14v14H0Z", "", "", ""]`                 |
| `index`  | `logoLines`      | array  | the line (0 to 3) of each name, a number or its text; none: the first                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `["0", "1"]`                                    |
| `index`  | `logoNames`      | array  | project names; each is drawn as its logo, as text, or both, in one card                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `["Example"]`                                   |
| `index`  | `logoWithName`   | array  | a name per logo: any text draws the name next to it; empty: the logo replaces it                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `["1"]`                                         |
| `index`  | `logos`          | array  | one ink path per name (no layers), the old form; unused where `logoLayers` has an entry                                                                                                                                                                                                                                                                                                                                                                                                                                                | `["M0 0h14v14H0Z"]`                             |
| `index`  | `logosRow`       | number | the index of the label whose value the card replaces; default -1: none                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `5`                                             |
| `footer` | `headline`       | string | the closing line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: GitHub                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `Email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `hello@example.com`                             |

The index is as tall as its rows: one per label plus the Languages row, up to eight, so a short list leaves no empty
space below it. The row named by `logosRow` shows a business card instead of its text: a panel of up to four lines, each with a caption from `logoLabels` (a line whose caption is empty continues the one above; with no caption at all the names start at the left) and the names whose `logoLines` entry is that line's number. A name is drawn as its colour logo: `logoLayers` holds 4 path slots per name (name k at 4k to 4k+3, painted bottom to top; each path with its origin at 0 0, 14 px tall, absolute `M`/`L`/`C`/`Z`; slot 0 is the whole silhouette and each later slot what the next colour covers, so the colours leave no seam; at most 6000 characters of path data for the layers of one name), each filled with the `#RRGGBB` at the same index of `logoFills` and, in the dark design, of `logoFillsDark` first; an empty fill draws in the ink of the row, so a neutral part follows the theme and a brand colour keeps its hue (keep each fill at 2:1 contrast with the panel in both designs, or give the dark design its own). A name with `logoWithName` set is drawn next to its logo (an icon); without it the logo replaces the name (a wordmark). A name without layers uses the old single ink path of `logos`, else it is drawn as text. The fills must be colours: any other text makes the render fail and writes nothing of it. Every line adds 24 px to the index, after the first (399 at most); at most 12 names are drawn and a line is cut at the panel edge. Without `logoNames` or with `logosRow` outside the rows the row shows its text.

For example, `settings.json` for the `header` section:

```json
{
  "header": {
    "intro": "I build developer tools and write about them."
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
  <img alt="The last twelve months as a ring" src="readmint/year.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/index.dark.svg">
  <img alt="Index" src="readmint/index.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/recent.dark.svg">
  <img alt="Recent work" src="readmint/recent.svg">
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

The header's ring and the year's ring turn without end (one turn a minute), the dots pulse and the last push types itself out; the index and recent work grow in once. The header, the year and the six repository slots loop every 60 seconds, so their one-shots replay once per loop: the last push types itself out again, the total counts up again and each repository line draws in again every minute. A PNG export and a reader who asks for less motion see the final state. Raster exports of the 54 and 60 second loops are sampled at the highest frame rate the raster limits allow (docs/raster.md, "The default frame rate"), not 30; the loops themselves are not shortened, and the rate drops further where the file would pass 5 MiB; the year is the exception, SVG only (or GIF) as WebP and APNG at scale 2 (table in docs/components.md, "Raster export of the long loops").
