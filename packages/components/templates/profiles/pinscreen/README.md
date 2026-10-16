# Pinscreen

An editor-style profile in Geist and Geist Mono, with IntelliJ Light and Darcula syntax colours. The year is a 3D wall of pins, one a day, with a ripple running out from today; the repositories are Kotlin objects, recent commits a terminal `git log`, and the stack a `build.gradle.kts`.

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

## Your texts

The personal texts are set once, in `settings.json` next to the designs: an object with one entry per section (the
design's file name without `.json` and `.dark`), each holding that section's props. The Action input `props-file`
(CLI: `--props`) merges a section's props into the root component of its light design **and** its `.dark` twin, so
you write every text once. They are empty in this folder, and an empty text hides its block; the file lists every
prop of every section that has one, at its component default. Delete what you do not use, a prop left out keeps the
design's own value. A value in `settings.json` wins over the same prop written in a design, an unknown section
is ignored by the CLI and warned about by the Action, and a prop a section does not have fails the render. `theme`
stays in the design (it is what makes the twin dark); `slot` of the repository sections may be set in either.

| section  | prop             | type   | what it shows                                                   | example                                         |
| -------- | ---------------- | ------ | --------------------------------------------------------------- | ----------------------------------------------- |
| `header` | `role`           | string | the line under the name                                         | `Developer. Tools and infrastructure.`          |
| `header` | `intro`          | string | the line under it; empty: the GitHub bio                        | `I build developer tools and write about them.` |
| `header` | `branch`         | string | the branch in the status bar; default main                      | `main`                                          |
| `header` | `statusBarRight` | string | the right end of the status bar                                 | `TypeScript · LF · UTF-8`                       |
| `stack`  | `plugin`         | string | the plugins block; empty: no block                              | `kotlin("jvm")`                                 |
| `stack`  | `labels`         | array  | a comment per dependency line, up to four                       | `["tools", "data"]`                             |
| `stack`  | `items`          | array  | the dependencies of each line                                   | `["git, make", "sqlite"]`                       |
| `stack`  | `noteLabels`     | array  | comment lines at the end, up to three                           | `["editor"]`                                    |
| `stack`  | `noteItems`      | array  | their texts                                                     | `["Neovim"]`                                    |
| `stack`  | `logoNames`      | array  | project names drawn as a logo strip in one note line            | `["Example"]`                                   |
| `stack`  | `logos`          | array  | the path data of each logo, empty to draw the name as text      | `["M0 0h14v14H0Z"]`                             |
| `stack`  | `logosRow`       | number | the index of the note line the strip replaces; default -1: none | `1`                                             |
| `footer` | `headline`       | string | the closing line                                                | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                                               | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: github                       | `email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address                         | `hello@example.com`                             |

The stack is as tall as its build file, up to fifteen lines, and never shorter than its languages panel, so a short
file leaves no empty space below it. The row named by `logosRow` shows a strip instead of its text: each name in `logoNames` is drawn as the path data in the same place of `logos` (one monochrome path with its origin at 0 0, about 14 px tall, in the ink of the row, so one path serves the light and the dark design) or, where that entry is empty, as the name itself. Six or more names take two lines, which adds one code line (16 at most); at most 12 are drawn and a line is cut at its edge. Without `logoNames` or with `logosRow` outside the rows the row shows its text.

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

Every section reads the `github.*` object of the [GitHub data source](../../../../../docs/data-github.md). The loader provides
`github.status`, `github.pushes[]` and `github.pinned[]` with `weeklyCommits[52]`. A design reads them as optional (a
missing property is `null`) and shows a plain line where they are missing, for instance when the token cannot read
them (the Actions `GITHUB_TOKEN` may not read the status); without `github.pinned` the repository slots show
`github.repositories`.
[docs/components.md](../../../../../docs/components.md#profile-templates) lists the fields and their shape.

## Motion

The ripple runs through the pins every nine seconds, the status dot pulses and the carets blink; the repositories' code lines and the stack's language bars appear once. The header and the git log loop every 60 seconds and the year every 54 seconds (six ripples), so their one-shots replay once per loop: the push types itself out again, the git log prints again and the total counts up again. A PNG export and a reader who asks for less motion see the final state.
