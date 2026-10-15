# Horizon

A poster profile in condensed Archivo with Geist Mono and an orange accent. The name runs the full width, the latest pushes run past in a ticker, and the year is a lit, shaded 3D terrain whose peaks turn orange. The repositories are ranked by stars, each with a bar code of its weeks.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/horizon/` in your profile repository.
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
```

The repository rows rank `github.pinned` by stars: `repo-1` shows the most starred, `repo-6` the sixth. Each slot's design differs only in its root prop `slot` (0 to 5).

## Your texts

The personal texts are root props of each section: the `props` of the one layer in `layers`, next to `theme`. They
are empty in this folder, and an empty text hides its block. Write the same props in the light design and its twin.

| section  | prop              | type   | what it shows                                           | example                        |
| -------- | ----------------- | ------ | ------------------------------------------------------- | ------------------------------ |
| `header` | `role`            | string | first column, first line                                | `Developer`                    |
| `header` | `roleDetail`      | string | first column, second line                               | `Tools and infrastructure`     |
| `header` | `workingOn`       | string | second column, first line                               | `A build cache,`               |
| `header` | `workingOnDetail` | string | second column, second line                              | `a docs site`                  |
| `header` | `statusNote`      | string | third column, under the GitHub status                   | `Open to new projects`         |
| `stack`  | `labels`          | array  | column headings after the languages, up to four         | `["Tools", "Data"]`            |
| `stack`  | `items`           | array  | one text per heading, an item per line                  | `["Git\nMake", "SQLite"]`      |
| `worked` | `items`           | array  | the names that run past; empty: the section stays blank | `["Team A", "Team B"]`         |
| `footer` | `headline`        | string | the poster line, two lines with a line break            | `Open to new\nprojects.`       |
| `footer` | `note`            | string | two lines with a line break                             | `Tooling and\ninfrastructure.` |
| `footer` | `contactLabel`    | string | the label over the contact; empty: github               | `email`                        |
| `footer` | `contactText`     | string | the contact; empty: your GitHub address                 | `hello@example.com`            |

For example, in `header.json` (and `header.dark.json` with `"theme": "dark"`):

```json
"layers": [{ "type": "component", "ref": "card", "props": {"theme":"light","role":"Developer","roleDetail":"Tools and infrastructure","workingOn":"A build cache,","workingOnDetail":"a docs site","statusNote":"Open to new projects"} }]
```

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

Every section reads the `github.*` object of the [GitHub data source](../../../../../docs/data-github.md). Some fields are
not loaded yet; a design reads them as optional (a missing property is `null`) and shows a plain line where they are
missing, so it renders with today's data too. Until the loader provides them, pass a data file with them
(`data-file`): `github.status`, `github.pushes[]` and `github.pinned[]` with `weeklyCommits[52]`.
[docs/components.md](../../../../../docs/components.md#profile-templates) lists the fields and their shape.

## Motion

The ticker and the worked-with line run without end, the status and today's dot pulse, and the total counts up; the bar codes, star bars and stack columns grow in once. A PNG export and a reader who asks for less motion see the final state.
