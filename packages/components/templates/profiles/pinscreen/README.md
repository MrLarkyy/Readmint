# Pinscreen

A profile set as an IDE, in Geist and Geist Mono with the IntelliJ Light and Darcula colours. The year is a pin screen with a ripple spreading from today; repositories are Kotlin objects, the commits a terminal and the stack a build script.

Every section is a design of the public design format, drawn in a light and a dark variant (`<section>.json` and
`<section>.dark.json`, which differ only in the root prop `theme`). Nothing in them names a person: the text comes from
the `github.*` data of the account the Action runs for.

## Use it

1. Copy this folder, with its `fonts/`, to `readmint/designs/pinscreen/` in your profile repository.
2. Add the workflow below. Only the light designs are listed; the Action finds each `.dark.json` next to its light
   design and writes both.
3. Paste the snippets below into your profile `README.md`, with your own login and repository addresses.

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
            readmint/designs/pinscreen/repo-1.json
            readmint/designs/pinscreen/repo-2.json
            readmint/designs/pinscreen/repo-3.json
            readmint/designs/pinscreen/repo-4.json
            readmint/designs/pinscreen/log.json
            readmint/designs/pinscreen/stack.json
            readmint/designs/pinscreen/footer.json
```

The repository slots show `github.pinned` when the data has it, else the first `github.repositories`, in the order the
data gives (stars descending). Change which repository a slot shows by changing the root prop `slot` of its design (0 to 3).

## The README

SVG links do not work inside an `<img>`, so each repository and the contact footer sit in a link around the image.

<!-- prettier-ignore -->
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/header.dark.svg">
  <img alt="Editor header" src="readmint/header.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/year.dark.svg">
  <img alt="The last year as a pin screen" src="readmint/year.svg">
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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readmint/log.dark.svg">
  <img alt="Git log" src="readmint/log.svg">
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
(`data-file`): `github.status.message` (status bar), `github.pushes[]` (branch, last push, git log), `github.pinned[]` (else `github.repositories[]`). [docs/components.md](../../../../../docs/components.md#profile-templates) lists the fields and their shape.

## Motion

The year sections animate once when the image loads (the ring turns once, the number counts up, lines draw) and then
rest in their final state; the same final state is what a PNG export and a reader who asks for less motion see. Only
the tickers of Horizon loop.
