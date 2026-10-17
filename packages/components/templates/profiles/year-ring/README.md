# Year Ring

A calm, cobalt profile set in Archivo. The year is a slowly turning 3D ring with a line for every day, as tall as the square root of its commits, the longest streak marked along its base and the total counted up in its middle. The repositories draw their own 52-week lines.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/year-ring/` in your profile repository.
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
            readmint/designs/year-ring/header.json
            readmint/designs/year-ring/year.json
            readmint/designs/year-ring/index.json
            readmint/designs/year-ring/recent.json
            readmint/designs/year-ring/work.json
            readmint/designs/year-ring/repo-1.json
            readmint/designs/year-ring/repo-2.json
            readmint/designs/year-ring/repo-3.json
            readmint/designs/year-ring/repo-4.json
            readmint/designs/year-ring/repo-5.json
            readmint/designs/year-ring/repo-6.json
            readmint/designs/year-ring/footer.json
          props-file: readmint/designs/year-ring/settings.json
```

The repository slots show `github.pinned` in the order the data gives, or `github.repositories` where the data has no pinned list (the loader fills `github.pinned`). Change which repository a slot shows by changing the root prop `slot` of its design (0 to 5).

## Your texts

The personal texts are set once, in `settings.json` next to the designs: an object with one entry per section (the
design's file name without `.json` and `.dark`), each holding that section's props. The Action input `props-file`
(CLI: `--props`) merges a section's props into the root component of its light design **and** its `.dark` twin, so
you write every text once. They are empty in this folder, and an empty text hides its block; the file lists every
prop of every section that has one, at its component default. Delete what you do not use, a prop left out keeps the
design's own value. A value in `settings.json` wins over the same prop written in a design, an unknown section
is ignored by the CLI and warned about by the Action, and a prop a section does not have fails the render. `theme`
stays in the design (it is what makes the twin dark); `slot` of the repository sections may be set in either.

| section  | prop             | type   | what it shows                                                                                                                                                                                                                                                                         | example                                         |
| -------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `header` | `intro`          | string | two lines under the name; empty: the GitHub bio                                                                                                                                                                                                                                       | `I build developer tools and write about them.` |
| `index`  | `labels`         | array  | the row labels, in order                                                                                                                                                                                                                                                              | `["Focus", "Tools"]`                            |
| `index`  | `values`         | array  | the row texts, one per label                                                                                                                                                                                                                                                          | `["Developer tooling", "Git, Make, Neovim"]`    |
| `index`  | `languageShare`  | enum   | `bytes` (default): the languages by bytes of code; `repositories`: the per-repository weighted share (each repository counts once, split over its languages by bytes, then averaged), so one large repository does not dominate; falls back to bytes without `github.languagesByRepo` | `repositories`                                  |
| `index`  | `languagesAfter` | number | the Languages row (top three by bytes) comes after this many rows; default 2                                                                                                                                                                                                          | `1`                                             |
| `index`  | `logoFills`      | array  | the fill of each layer, `#RRGGBB`, at the index of `logoLayers`; empty: the ink of the row                                                                                                                                                                                            | `["", "#E5484D"]`                               |
| `index`  | `logoFillsDark`  | array  | the same for the dark design, read first; empty: `logoFills`                                                                                                                                                                                                                          | `["", "#FF6369"]`                               |
| `index`  | `logoLabels`     | array  | a caption per line of the card, up to four; empty: a line continues the one above                                                                                                                                                                                                     | `["Now", "Before"]`                             |
| `index`  | `logoLayers`     | array  | 4 path layers per name (name k: 4k to 4k+3), bottom to top; empty: `logos`, then the name                                                                                                                                                                                             | `["M0 0h14v14H0Z", "", "", ""]`                 |
| `index`  | `logoLines`      | array  | the line (0 to 3) of each name, a number or its text; none: the first                                                                                                                                                                                                                 | `["0", "1"]`                                    |
| `index`  | `logoNames`      | array  | project names; each is drawn as its logo, as text, or both, in one card                                                                                                                                                                                                               | `["Example"]`                                   |
| `index`  | `logoWithName`   | array  | a name per logo: any text draws the name next to it; empty: the logo replaces it                                                                                                                                                                                                      | `["1"]`                                         |
| `index`  | `logos`          | array  | one ink path per name (no layers), the old form; unused where `logoLayers` has an entry                                                                                                                                                                                               | `["M0 0h14v14H0Z"]`                             |
| `index`  | `logosRow`       | number | the index of the label whose value the card replaces; default -1: none                                                                                                                                                                                                                | `5`                                             |
| `footer` | `headline`       | string | the closing line                                                                                                                                                                                                                                                                      | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                                                                                                                                                                                                                                                                     | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: GitHub                                                                                                                                                                                                                                             | `Email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address                                                                                                                                                                                                                                               | `hello@example.com`                             |

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

The header's ring and the year's ring turn without end (one turn a minute), the dots pulse and the last push types itself out; the index and recent work grow in once. The header, the year and the six repository slots loop every 60 seconds, so their one-shots replay once per loop: the last push types itself out again, the total counts up again and each repository line draws in again every minute. A PNG export and a reader who asks for less motion see the final state. Raster exports of the 54 and 60 second loops are sampled at the highest frame rate the raster limits allow (docs/raster.md, "The default frame rate"), not 30; the loops themselves are not shortened, and some sections still need a lower rate or scale for WebP and APNG under 5 MiB (table in docs/components.md, "Raster export of the long loops").
