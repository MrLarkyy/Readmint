# Horizon

A poster profile in condensed Archivo with Geist Mono and an orange accent. The name runs the full width, the latest pushes run past in a ticker, and the year is a lit, shaded 3D terrain whose peaks turn orange. The repositories are ranked by stars, each with a bar code of its weeks.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/horizon/` in your profile repository.
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
            readmint/designs/horizon/header.json
            readmint/designs/horizon/ticker.json
            readmint/designs/horizon/year.json
            readmint/designs/horizon/work.json
            readmint/designs/horizon/repo-1.json
            readmint/designs/horizon/repo-2.json
            readmint/designs/horizon/repo-3.json
            readmint/designs/horizon/repo-4.json
            readmint/designs/horizon/repo-5.json
            readmint/designs/horizon/repo-6.json
            readmint/designs/horizon/stack.json
            readmint/designs/horizon/worked.json
            readmint/designs/horizon/footer.json
          props-file: readmint/designs/horizon/settings.json
```

The repository rows rank the first six of `github.pinned` (else of `github.repositories`, which the loader produces today) by stars: `repo-1` shows the most starred, `repo-6` the sixth. Each slot's design differs only in its root prop `slot` (0 to 5).

## Your texts

The personal texts are set once, in `settings.json` next to the designs: an object with one entry per section (the
design's file name without `.json` and `.dark`), each holding that section's props. The Action input `props-file`
(CLI: `--props`) merges a section's props into the root component of its light design **and** its `.dark` twin, so
you write every text once. They are empty in this folder, and an empty text hides its block; the file lists every
prop of every section that has one, at its component default. Delete what you do not use, a prop left out keeps the
design's own value. A value in `settings.json` wins over the same prop written in a design, an unknown section
is ignored by the CLI and warned about by the Action, and a prop a section does not have fails the render. `theme`
stays in the design (it is what makes the twin dark); `slot` of the repository sections may be set in either.

| section  | prop              | type   | what it shows                                                                                                                                                                                                                                                                         | example                        |
| -------- | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `header` | `role`            | string | first column, first line                                                                                                                                                                                                                                                              | `Developer`                    |
| `header` | `roleDetail`      | string | first column, second line                                                                                                                                                                                                                                                             | `Tools and infrastructure`     |
| `header` | `workingOn`       | string | second column, first line                                                                                                                                                                                                                                                             | `A build cache,`               |
| `header` | `workingOnDetail` | string | second column, second line                                                                                                                                                                                                                                                            | `a docs site`                  |
| `header` | `statusNote`      | string | third column, under the GitHub status, or in its place                                                                                                                                                                                                                                | `Open to new projects`         |
| `stack`  | `languageShare`   | enum   | `bytes` (default): the languages by bytes of code; `repositories`: the per-repository weighted share (each repository counts once, split over its languages by bytes, then averaged), so one large repository does not dominate; falls back to bytes without `github.languagesByRepo` | `repositories`                 |
| `stack`  | `labels`          | array  | column headings after the languages, up to four                                                                                                                                                                                                                                       | `["Tools", "Data"]`            |
| `stack`  | `items`           | array  | one text per heading, an item per line                                                                                                                                                                                                                                                | `["Git\nMake", "SQLite"]`      |
| `worked` | `items`           | array  | the names that run past; empty: the section stays blank                                                                                                                                                                                                                               | `["Team A", "Team B"]`         |
| `footer` | `headline`        | string | the poster line, two lines with a line break                                                                                                                                                                                                                                          | `Open to new\nprojects.`       |
| `footer` | `note`            | string | two lines with a line break                                                                                                                                                                                                                                                           | `Tooling and\ninfrastructure.` |
| `footer` | `contactLabel`    | string | the label over the contact; empty: github                                                                                                                                                                                                                                             | `email`                        |
| `footer` | `contactText`     | string | the contact; empty: your GitHub address                                                                                                                                                                                                                                               | `hello@example.com`            |

For example, `settings.json` for the `header` section:

```json
{
  "header": {
    "role": "Developer",
    "roleDetail": "Tools and infrastructure",
    "workingOn": "A build cache,",
    "workingOnDetail": "a docs site",
    "statusNote": "Open to new projects"
  }
}
```

To render one section by hand: `readmint render header.json --props settings.json --data data.json`.

## The README

SVG links do not work inside an `<img>`, so each repository and the contact footer sit in a link around the image.

<!-- prettier-ignore -->
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/header.dark.svg">
  <img alt="Profile header" src="readmint/header.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/ticker.dark.svg">
  <img alt="Latest pushes" src="readmint/ticker.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/year.dark.svg">
  <img alt="The last twelve months as a terrain" src="readmint/year.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/work.dark.svg">
  <img alt="Selected work" src="readmint/work.svg">
</picture>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-1">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-1.dark.svg">
  <img alt="Repository 1" src="readmint/repo-1.svg">
</picture>
</a>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-2">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-2.dark.svg">
  <img alt="Repository 2" src="readmint/repo-2.svg">
</picture>
</a>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-3">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-3.dark.svg">
  <img alt="Repository 3" src="readmint/repo-3.svg">
</picture>
</a>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-4">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-4.dark.svg">
  <img alt="Repository 4" src="readmint/repo-4.svg">
</picture>
</a>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-5">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-5.dark.svg">
  <img alt="Repository 5" src="readmint/repo-5.svg">
</picture>
</a>

<a href="https://github.com/YOUR-LOGIN/YOUR-REPOSITORY-6">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-6.dark.svg">
  <img alt="Repository 6" src="readmint/repo-6.svg">
</picture>
</a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/stack.dark.svg">
  <img alt="Stack" src="readmint/stack.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/worked.dark.svg">
  <img alt="Worked with" src="readmint/worked.svg">
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

The ticker and the worked-with line run without end and the status and today's dot pulse; the bar codes, star bars and stack columns grow in once. The header, the ticker, the year and the worked-with line loop every 60 seconds, so the year's one-shot replays once per loop: the total counts up again every minute. A PNG export and a reader who asks for less motion see the final state.
