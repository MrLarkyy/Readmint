# Pinscreen

An editor-style profile in Geist and Geist Mono, with IntelliJ Light and Darcula syntax colours. The year is a 3D wall of pins, one a day, with a ripple running out from today; the repositories are Kotlin objects, recent commits a terminal `git log`, and the stack a `build.gradle.kts`.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the data comes
from the `github.*` object of the account the Action runs for, and your own texts go into the root props below.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/pinscreen/` in your profile repository.
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
```

The repository cards show `github.pinned` in the order the data gives. Change which repository a card shows by changing the root prop `slot` of its design (0 to 5).

## Your texts

The personal texts are root props of each section: the `props` of the one layer in `layers`, next to `theme`. They
are empty in this folder, and an empty text hides its block. Write the same props in the light design and its twin.

| section  | prop             | type   | what it shows                              | example                                         |
| -------- | ---------------- | ------ | ------------------------------------------ | ----------------------------------------------- |
| `header` | `role`           | string | the line under the name                    | `Developer. Tools and infrastructure.`          |
| `header` | `intro`          | string | the line under it; empty: the GitHub bio   | `I build developer tools and write about them.` |
| `header` | `branch`         | string | the branch in the status bar; default main | `main`                                          |
| `header` | `statusBarRight` | string | the right end of the status bar            | `TypeScript · LF · UTF-8`                       |
| `stack`  | `plugin`         | string | the plugins block; empty: no block         | `kotlin("jvm")`                                 |
| `stack`  | `labels`         | array  | a comment per dependency line, up to four  | `["tools", "data"]`                             |
| `stack`  | `items`          | array  | the dependencies of each line              | `["git, make", "sqlite"]`                       |
| `stack`  | `noteLabels`     | array  | comment lines at the end, up to three      | `["editor"]`                                    |
| `stack`  | `noteItems`      | array  | their texts                                | `["Neovim"]`                                    |
| `footer` | `headline`       | string | the closing line                           | `Open to new projects.`                         |
| `footer` | `note`           | string | one line under it                          | `Tooling, infrastructure and documentation.`    |
| `footer` | `contactLabel`   | string | the label over the contact; empty: github  | `email`                                         |
| `footer` | `contactText`    | string | the contact; empty: your GitHub address    | `hello@example.com`                             |

For example, in `header.json` (and `header.dark.json` with `"theme": "dark"`):

```json
"layers": [{ "type": "component", "ref": "card", "props": {"theme":"light","role":"Developer. Tools and infrastructure.","intro":"I build developer tools and write about them.","branch":"main","statusBarRight":"TypeScript · LF · UTF-8"} }]
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

Every section reads the `github.*` object of the [GitHub data source](../../../../../docs/data-github.md). Some fields are
not loaded yet; a design reads them as optional (a missing property is `null`) and shows a plain line where they are
missing, so it renders with today's data too. Until the loader provides them, pass a data file with them
(`data-file`): `github.status`, `github.pushes[]` and `github.pinned[]` with `weeklyCommits[52]`.
[docs/components.md](../../../../../docs/components.md#profile-templates) lists the fields and their shape.

## Motion

The ripple runs through the pins every nine seconds, the status dot pulses and the carets blink; the code lines, the terminal output and the language bars appear once. A PNG export and a reader who asks for less motion see the final state.
