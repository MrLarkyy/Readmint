# Year Ring

A calm, cobalt profile set in Archivo. The year is a slowly turning 3D ring with a line for every day, as tall as the square root of its commits, the longest streak marked along its base and the total counted up in its middle. The repositories draw their own 52-week lines.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/year-ring/` in your profile repository.
2. Fill in your texts (below) in each light design and the same in its `.dark.json`.
3. Add the workflow below. Only the light designs are listed; the Action finds each `.dark.json` next to its light
   design and writes both.
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
```

The repository slots show `github.pinned` in the order the data gives, or `github.repositories` where the data has no pinned list (the loader fills `github.pinned`). Change which repository a slot shows by changing the root prop `slot` of its design (0 to 5).

## Your texts

The personal texts are root props of each section: the `props` of the one layer in `layers`, next to `theme`. They
are empty in this folder, and an empty text hides its block. Write the same props in the light design and its twin.

| section  | prop             | type   | what it shows                                                                | example                                         |
| -------- | ---------------- | ------ | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `header` | `intro`          | string | two lines under the name; empty: the GitHub bio                              | `I build developer tools and write about them.` |
| `index`  | `labels`         | array  | the row labels, in order                                                     | `["Focus", "Tools"]`                            |
| `index`  | `values`         | array  | the row texts, one per label                                                 | `["Developer tooling", "Git, Make, Neovim"]`    |
| `index`  | `languagesAfter` | number | the Languages row (top three by bytes) comes after this many rows; default 2 | `1`                                             |
| `footer` | `headline`       | string | the closing line                                                             | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                                                            | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: GitHub                                    | `Email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address                                      | `hello@example.com`                             |

For example, in `header.json` (and `header.dark.json` with `"theme": "dark"`):

```json
"layers": [{ "type": "component", "ref": "card", "props": {"theme":"light","intro":"I build developer tools and write about them."} }]
```

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

Every section reads the `github.*` object of the [GitHub data source](../../../../../docs/data-github.md). The loader provides
`github.status`, `github.pushes[]` and `github.pinned[]` with `weeklyCommits[52]`. A design reads them as optional (a
missing property is `null`) and shows a plain line where they are missing, for instance when the token cannot read
them (the Actions `GITHUB_TOKEN` may not read the status); without `github.pinned` the repository slots show
`github.repositories`.
[docs/components.md](../../../../../docs/components.md#profile-templates) lists the fields and their shape.

## Motion

The header's ring and the year's ring turn without end (one turn a minute), the dots pulse and the last push types itself out; the index and recent work grow in once. The header, the year and the six repository slots loop every 60 seconds, so their one-shots replay once per loop: the last push types itself out again, the total counts up again and each repository line draws in again every minute. A PNG export and a reader who asks for less motion see the final state.
