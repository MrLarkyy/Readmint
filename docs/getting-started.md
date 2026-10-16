# Getting started

Readmint turns a design file into a README graphic and keeps it current with a GitHub Action in your own repository.
This page is the shortest path from nothing to a rendered graphic; the rest of the wiki explains each step in depth.

## 1. Write a design

A design is a YAML or JSON file in your repository, for example `readmint/designs/card.yaml`. The quickest start is a
template: copy one from the [examples repository](https://github.com/MrLarkyy/readmint-template-test) (ready-to-copy
workflows and designs, with the fonts they use) or from the [starter templates](components.md#starter-templates), and
change it. The [design format](design-format.md) describes every layer, asset and animation, and
[expressions](expressions.md) bind text to your GitHub data.

## 2. Add the workflow

Save this as `.github/workflows/readmint.yml`, with an exact release tag instead of `vX.Y.Z` and your own design paths:

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

Every input, the permissions the push needs and the errors are in the [GitHub Action](action.md) page.

## 3. Run it and use the snippet

Run the workflow once with _Run workflow_. It commits the rendered files and prints a `<picture>` snippet in the log
group `README snippet`; paste the snippet into your README. After that the schedule keeps the graphic current.

## Try a design on your machine

The [CLI](cli.md) renders and previews a design locally with the same renderer, from fixture data and without a token.
The [editor](editor.md) edits a design visually with the same live preview.

## Where next

- Fonts you bring yourself, and when they are embedded: [fonts.md](fonts.md).
- The data your design can read: [data-sources.md](data-sources.md) and [data-github.md](data-github.md).
- PNG, WebP, APNG and GIF instead of SVG: [raster.md](raster.md).
- Something failed: [troubleshooting.md](troubleshooting.md).
