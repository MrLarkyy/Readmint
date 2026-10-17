# Components and templates

`@readmint/components` ships templates: plain [design format](design-format.md) v0 files, rendered by the same
renderer as any design. Nothing about them is built into the renderer; copy one and change anything.

## Contribution calendar

| template             | file                                                            | look                                             |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `calendar-heatmap`   | `@readmint/components/templates/calendar-heatmap.design.json`   | rounded squares coloured by level, like GitHub   |
| `calendar-isometric` | `@readmint/components/templates/calendar-isometric.design.json` | isometric pillars whose height follows the count |
| `calendar-dots`      | `@readmint/components/templates/calendar-dots.design.json`      | dots that grow with the level                    |

`calendarTemplates` from `@readmint/components` lists these names. Each file uses no fonts, no images and no external
reference, and reads the calendar of the [GitHub data source](data-github.md) by name: `github.contributions` with its
`weeks` and `days[]` (`date`, `count`, `level`, `weekday`, `week`). Another source with the same shape works after
changing the `repeat.each` of the calendar component.

Every template holds two components and one instance:

- `components.calendar`: the layout. One `cell` instance per day (`repeat` over `github.contributions.days`), placed
  by orientation and projection, with the cell props below. It is identical in all three files.
- `components.cell`: how one day looks. This is what differs between the templates.
- `layers`: one `calendar` instance at `x: 8, y: 8`; its `props` choose the options (the isometric template sets
  `projection: "isometric"`). Set `theme: "dark"` there for the dark look (below).

### Calendar options

Props of the `calendar` instance:

| prop                  | type   | default              | meaning                                                                                 |
| --------------------- | ------ | -------------------- | --------------------------------------------------------------------------------------- |
| `cellSize`            | number | `11`                 | side of a cell (half the width of an isometric top face)                                |
| `gap`                 | number | `3`                  | space between cells; the pitch is `cellSize + gap`                                      |
| `radius`              | number | `2`                  | corner radius, passed to the cell (the heatmap cell uses it)                            |
| `orientation`         | enum   | `"horizontal"`       | `"horizontal"`: weeks are columns, weekdays rows; `"vertical"`: swapped                 |
| `projection`          | enum   | `"flat"`             | `"flat"` or `"isometric"`                                                               |
| `weeks`               | number | `53`                 | draw only the last this many weeks; older days are dropped by an `if`                   |
| `maxCount`            | number | `20`                 | count at which an isometric pillar reaches `maxHeight`; larger counts are capped        |
| `maxHeight`           | number | `24`                 | tallest isometric pillar; also the room left above the calendar                         |
| `level0`..`4`         | color  | GitHub's greens      | colour of each level (`#ebedf0`, `#9be9a8`, `#40c463`, `#30a14e`, `#216e39`)            |
| `theme`               | enum   | `"light"`            | `"light"` or `"dark"`: picks the level colours and the canvas background                |
| `level0Dark`..`4Dark` | color  | GitHub's dark greens | level colours in the dark theme (`#161b22`, `#0e4429`, `#006d32`, `#26a641`, `#39d353`) |

`orientation`, `projection` and `theme` are enum props: any other value is a validation issue (`enum`), or a `type` render issue
when it comes from data.

**Canvas.** The calendar instance is the root instance, so the canvas bindings read its props
([design format](design-format.md#components)) and the size follows them. With the pitch `p = cellSize + gap` and
`w = min(github.contributions.weeks, weeks)` columns, a flat template is `w * p - gap + 16` wide and `7 * p - gap + 16`
high (swapped when `orientation` is `"vertical"`), the isometric one `(w + 5) * p + 2 * cellSize + 16` by
`(w + 5) * p / 2 + cellSize + maxHeight + 16` (`16` is twice the margin of 8). At the defaults that is
`min(weeks, 53) * 14 + 13` by `111` and `(min(weeks, 53) + 5) * 14 + 38` by `(min(weeks, 53) + 5) * 7 + 51`. Setting
`cellSize`, `gap`, `weeks`, `maxHeight` or `orientation` on the instance resizes the canvas with it; a fractional size
is rounded up to whole pixels (`| ceil`) and kept within the canvas range 1 to 4096 (`| clamp(1, 4096)`). The
canvas `background` is `#ffffff` in the light theme and `none` (transparent) in the dark one, so a dark calendar sits
on the page behind it.

**Projections.** Flat: a cell sits at `column * pitch`, `weekday * pitch` (swapped when vertical); `height` is 0.
Isometric: a cell sits at `x = (column - weekday + 6) * pitch`, `y = (column + weekday) * pitch / 2 + maxHeight`, and
`height = min(count, maxCount) / maxCount * maxHeight`, rounded to 2 decimals. Days are drawn in data order, ascending
by week and weekday; in the isometric projection that is back to front, because a later day that lies further back is
at least two pitches to the side and never overlaps an earlier one.

**Colour scale.** `color = [level0, level1, level2, level3, level4][day.level]`, `level0` for a level outside 0..4. With
`theme: "dark"` the same lookup reads `level0Dark`..`level4Dark`; `level0`..`4` then change nothing, and the dark
colours change nothing in the light theme.

### Cell props

The calendar passes every cell these props; a cell must declare all of them (an instance may set only declared
props), and may ignore any:

| prop      | type   | value                                              |
| --------- | ------ | -------------------------------------------------- |
| `level`   | number | the day's level, 0 to 4                            |
| `count`   | number | the day's contributions                            |
| `date`    | string | the day, `YYYY-MM-DD`                              |
| `index`   | number | position of the day in `github.contributions.days` |
| `week`    | number | column of the day in the drawn calendar, from 0    |
| `weekday` | number | 0 = Sunday to 6 = Saturday                         |
| `size`    | number | `cellSize`                                         |
| `radius`  | number | `radius`                                           |
| `height`  | number | pillar height in the isometric projection, else 0  |
| `color`   | color  | the level's colour from the scale                  |

A cell's origin is the top left of its square; an isometric cell draws its top face from `(size, -height)` to
`(2 * size, size / 2 - height)`, `(size, size - height)` and `(0, size / 2 - height)`.

### A custom cell

Replace `components.cell` of a template. The cell may draw any layers, bind any property to the props, and change
shape, colour and height. Path data follows the data through a `d` template, rounded to keep the output small:

```json
"cell": {
  "props": {
    "level": { "type": "number", "default": 0 },
    "count": { "type": "number", "default": 0 },
    "date": { "type": "string", "default": "" },
    "index": { "type": "number", "default": 0 },
    "week": { "type": "number", "default": 0 },
    "weekday": { "type": "number", "default": 0 },
    "size": { "type": "number", "default": 11 },
    "radius": { "type": "number", "default": 2 },
    "height": { "type": "number", "default": 0 },
    "color": { "type": "color", "default": "#ebedf0" }
  },
  "layers": [
    {
      "type": "path",
      "d": "M0 {{ props.size }} L{{ props.size / 2 }} {{ props.size - ((props.count | min(10)) / 10 * (props.size - 2) + 2) | round(2) }} L{{ props.size }} {{ props.size }} Z",
      "fill": "{{ [\"#eaeef2\", \"#ffd8a8\", \"#ffa94d\", \"#f76707\", \"#c92a2a\"][props.level] }}"
    }
  ]
}
```

## Starter templates

Five complete designs that show what the format can do; each is an ordinary design file you copy and change.

| template         | file                                                        | look                                                      | reads                                                            |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `stats-card`     | `@readmint/components/templates/stats-card.design.json`     | name and seven totals in two columns                      | `name`, `login`, `counts`, `followers`, `contributions.*` totals |
| `isometric-card` | `@readmint/components/templates/isometric-card.design.json` | the year's total over the isometric calendar              | `contributions.total`, `weeks`, `days[]`                         |
| `banner`         | `@readmint/components/templates/banner.design.json`         | a wide banner: name in a display font, bio under it       | `name`, `login`, `bio`                                           |
| `language-bars`  | `@readmint/components/templates/language-bars.design.json`  | the six biggest languages as bars in their colours        | `languages[]` (`name`, `color`, `share`)                         |
| `profile-card`   | `@readmint/components/templates/profile-card.design.json`   | the showcase: name, stats, isometric calendar and streaks | all of the above plus `contributions.streaks`                    |

`starterTemplates` from `@readmint/components` lists these names. Each file reads `github.*` of the
[GitHub data source](data-github.md) and nothing else; the numbers are formatted with the `compact`, `number`,
`percent` and `date` filters, and a missing or empty name falls back to the login (`github.name || github.login`), and a missing bio or language colour with `default()`.

- **Light and dark.** The canvas has no `background`, so the card sits on whatever page shows it. The one instance in
  `layers` carries the enum prop `theme` (`"light"`, the default, or `"dark"`); the colours are chosen from it
  inside the components, in GitHub's palettes: light panel `#ffffff` with border `#d0d7de`, text `#1f2328`, muted
  `#59636e`; dark panel `#0d1117` with border `#30363d`, text `#e6edf3`, muted `#9198a1`; the calendar levels
  follow the theme too. Set `"props": { "theme": "dark" }` on the root instance to switch; any other value is an
  `enum` issue. The theme sets no canvas `background` (a canvas binding could read it), so the card's rounded panel
  keeps the page around its corners.
- **The calendar.** `isometric-card` and `profile-card` carry the `calendar` and `cell` components of the
  calendar templates above unchanged (a test compares them); only the instance's props differ. They pass
  the card's `theme` to the calendar's own `theme`, so the dark levels are the calendar's `level0Dark`..`4Dark`.
- **Fonts.** Text needs a font asset. The templates use Montserrat Medium and ExtraBold from `templates/fonts/`
  (SIL Open Font License 1.1, `OFL.txt` and the sha256 of each file beside them); their `src` is the relative path
  `fonts/Montserrat-Medium.ttf`, resolved against the design file by the CLI and the Action. The banner names its
  headline font `display`: replace its `src`, `family` and `licence` (keep `embedding: "allowed"` only for a font
  you may embed) to set the banner in your own font. Montserrat has no CJK, Arabic, Devanagari or emoji glyphs: a name or bio in those is not drawn and the render warns `missing-glyph`. Add a font asset that has them and list it in the `fallback` of `body`, `bold` and `display` ([design format](design-format.md#assets)), and mind the size budget below.
- **Long and missing data.** Names are cut with `truncate`, counts shortened with `compact`, the language list shows
  six rows (`repeat` with `if: {{ i < 6 }}`; a dropped copy takes no slot) or a "No language data yet." line, and a
  streak of 0 days shows "No streak". In `year-ring`, the repository names and push messages of recent work and the
  repository cards' names, and the language names of the index Languages row (shared out by drawn width so the row
  ends left of the bar; the percentages stay) are cut to their box by drawn width (`truncateWidth`), and a card's
  description is capped at the two lines its box shows (`maxLines`), so a long one ends with `…` inside its box.
  Golden images pin the light and dark look of every template, the worst-case data (1024-character strings, 10^15
  counts) and, for `year-ring`, realistic long names, messages and descriptions in both themes
  (`index-long-languages-light` and `-dark` for the language names).
- **The sample data** the goldens render is synthetic (an invented account, `readmint-sample`), shaped like the
  data-github object.

## Profile templates

Three full README profiles, each a folder of designs under `@readmint/components/templates/profiles/<name>/`, built
section by section to the approved prototype (version 6):

| template    | look                                                                                                     | fonts (SIL OFL 1.1)                                                             | year visual                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `year-ring` | calm and cobalt; a typed last push, an index table, recent work, repository cards with a 52-week line    | Archivo (normal and SemiExpanded), Noto Sans fallback                           | a turning 3D ring, one line per day, the longest streak marked (runs of 2+ days) |
| `horizon`   | an orange poster: the name full width, a commit ticker, repositories ranked by stars, stack, worked with | Archivo (ExtraCondensed, SemiCondensed, normal), Geist Mono, Noto Sans fallback | a lit, shaded 3D terrain whose peaks turn orange                                 |
| `pinscreen` | an editor: a status bar, repositories as Kotlin objects, a terminal git log, a build script stack        | Geist, Geist Mono                                                               | a wall of pins with a ripple running out from today                              |

`profileTemplates` from `@readmint/components` maps each name to its sections (`ProfileTemplate`, `ProfileSection`).
A folder holds, per section, `<section>.json` and its dark twin `<section>.dark.json`, an example `README.md` and
`fonts/` (the TTF files the designs name, the licence of each family and the sha256 of every file):

| template    | sections                                                                              |
| ----------- | ------------------------------------------------------------------------------------- |
| `year-ring` | `header`, `year`, `index`, `recent`, `work`, `repo-1` to `repo-6`, `footer`           |
| `horizon`   | `header`, `ticker`, `year`, `work`, `repo-1` to `repo-6`, `stack`, `worked`, `footer` |
| `pinscreen` | `header`, `year`, `work`, `repo-1` to `repo-6`, `log`, `stack`, `footer`              |

- **One design per section.** Every section is an image of its own in the README, 840 pixels wide (the repository
  cards of `year-ring` and `pinscreen` 412, two to a row: the example `README.md` sets two linked images of 49 % width
  side by side). The canvas is transparent and the sections draw no card: they sit on the page like the prototype,
  in the GitHub page colours of the theme; only the Pinscreen panels (status bar, code, terminal) have a surface.
  The format has no mask, so the few fades (the veil over the far half of the Year Ring, the shade behind its total,
  the edges of the Horizon tickers) are gradients of the page colour, `#ffffff` or `#0d1117`, that run out to
  transparent: on another page colour (GitHub's dimmed themes) they show as a soft shade, never as a box.
  `work` is the heading strip above the repositories. The Action writes `readmint/<section>.svg` and
  `readmint/<section>.dark.svg` and prints the `<picture>` snippet that switches on `prefers-color-scheme`
  ([action.md](action.md#outputs-on-disk-and-the-dark-variant)): list only the light designs. The dark twin is the
  light file with the root prop `theme` set to `"dark"`, nothing else (a test compares them); the colours are chosen
  from that prop inside the design.
- **Links.** SVG links do not work inside an `<img>`, so a clickable element is a link around the image: the example
  `README.md` wraps each repository and the contact footer.
- **Text contrast.** Every text of a profile design reaches a contrast of 4.5:1 (WCAG AA for small text) against the
  page colour of its theme, `#ffffff` light and `#0d1117` dark, and, for Pinscreen, against its code and terminal panel as well (`#fafafa` light,
  `#12161d` dark), with no exception for decorative text: the code line
  numbers, the weekday letters and the `/` separators of the ticker are held to it too, so the secondary greys are
  dimmer than the body text but never fainter than 4.5:1. The footer credit, the Pinscreen code comments and the small
  orange text (the `today` label and the push hash of Horizon) use their own text shade; the orange of lines, dots and
  fills stays as it was. `profileContrast.test.ts` renders every section in both themes and fails on any text fill
  below that. It reads the fill, not the opacity: the 0.15 opacity of the Year Ring `MAR`/`OCT` labels is a depth
  cue (not part of this rule) and the animations start their text at opacity 0.
- **Repository slots.** `repo-1` to `repo-6` are the same design with the root prop `slot` 0 to 5 (a test pins that
  they differ in nothing else). A slot reads `github.pinned` (the loader fills it, see
  [pinned repositories, pushes and status](data-github.md#pinned-repositories-pushes-and-status)), or
  `github.repositories` where the data has no pinned list. In `year-ring` and `pinscreen` slot n shows the n-th of that list;
  `horizon` ranks its first six by stars (ties keep their order) and slot n shows the n-th. A slot past the list shows
  a plain "No repository in slot n." line (`pinscreen`: an empty file); a repository without `weeklyCommits` shows
  no line (`year-ring`) and flat bars (`horizon`).
- **Personal texts are root props.** What only a person can say (an introduction, a role, index rows, stack groups,
  the people worked with, the footer and the contact) is a prop of the root instance, declared per section with a
  default (empty for the texts); an empty prop hides its block (an empty introduction falls back to `github.bio`, an empty contact to
  the GitHub address). They are set once per template in its `settings.json` (below), which covers the light design and its twin alike. Array props hold strings only, so a
  table is two arrays of the same length (`labels`, `values`), and a multi-line item is one string with line breaks.
  Each template's `README.md` lists its props with neutral examples. The canvas height binds to the root props, so
  the sections whose rows come from props grow with them: the `year-ring` index is `39 + 36` per row (the labels plus
  the Languages row, up to 8 rows, 327; 24 more per extra line of a logo card, 399), the `pinscreen` build file `96 + 20` per code line (up to 15 lines, 396; one more per line of a logo card, up to 19 lines, 476) or
  the height its languages panel needs (`132 + 36` per language, up to 4), whichever is more. The `horizon` stack keeps
  its height: its groups are columns side by side, each item clipped to a fixed box. The sections whose rows come from
  data (recent work, the git log) grow with them too.
- **The language share.** The languages of the `year-ring` index, the `horizon` stack and the `pinscreen` stack take
  the enum prop `languageShare`: `bytes` (the default, `github.languages`), `repositories`
  (`github.languagesByRepo`, every repository weighing the same, see [data-github.md](data-github.md#languages)) or
  `authored` (`github.languagesAuthored`, the lines you added per language, see
  [data-github.md](data-github.md#languages-from-your-own-commits); it is empty unless the loader reads commits). Data
  without `languagesByRepo` or with an empty `languagesAuthored` (an older Action, a fixture, no commit cap) draws the bytes list, and the default renders as before. The generic
  `language-bars` template stays on bytes.
- **A logo card is path data in props.** The `year-ring` index and the `pinscreen` stack take `logoNames`, `logoLayers`, `logoFills`, `logoFillsDark`, `logoWithName`, `logos`, `logoLabels`, `logoLines` (arrays) and `logosRow` (a number, default -1): the row `logosRow` of the `labels` (`year-ring`) or of the `noteLabels` (`pinscreen`, whose label line stays) shows a business card of up to four lines. The expression language has no split or count, so the grouping is explicit: `logoLabels` holds one caption per line (an empty caption continues the line above, none at all gives one line without a caption column) and `logoLines` the line index of each name, a number or its text (a missing entry is line 0, a line the captions do not give is not drawn). A name is drawn as up to 4 stacked colour layers (`logoLayers`: 4 slots per name, name k at 4k to 4k+3, painted bottom to top, slot 0 the whole silhouette and each later slot what the next colour covers; origin at 0 0, 14 px tall, absolute `M`/`L`/`C`/`Z`, at most 6000 characters per name), each filled with the `#RRGGBB` at the same index of `logoFills`, or of `logoFillsDark` first in the dark design; an empty fill draws in the ink of that row, so a neutral part of a mark follows the theme. With `logoWithName` set the name is drawn next to its logo (an icon), else the logo replaces it (a wordmark); a name without layers falls back to one ink path in `logos` and then to text. A fill that is not a colour fails the render. At most 12 names are drawn, and each line is clipped at the panel edge. A row that is not a whole number, outside the rows, or (`year-ring`) hidden by the 8-row cap shows no card and adds no height. No renderer feature is behind it: a `repeat` of lines, of names and of the four slots, with `path` layers whose `d` and `fill` are placeholders. The canvas grows by 24 px per line after the first (`year-ring`, 399 at most) or one code line per line (`pinscreen`, up to 19 lines, 476). The logos of the example are recorded in `packages/examples/src/profileLogos.ts` with their source, date, hash, licence as the source states it, mark owner and who answers for showing it; a mark that could not be found or verified shows as text. The colours are traced from the file named there, merged to at most 4, and a colour too close to the card gets a lightness-shifted twin in the dark or light fill.
- **No user in a design.** No design contains a login, name, address or personal text; every other text comes from
  `github.*`, so another account's data needs no edit. The render date is `github.contributions.to`: a render reads no
  clock, so times are days ("today", "yesterday", "3 days ago", read from the calendar's own dates), never hours.
- **Fonts.** Archivo (Omnibus-Type), Noto Sans (Noto Project), Geist and Geist Mono (Vercel) are SIL OFL 1.1 static TTFs, byte copies of the
  upstream files (origin, version and sha256 in each `fonts/README.md`), none with a Reserved Font Name and all with
  OS/2 `fsType` 0, so the renderer embeds a subset of the glyphs a section draws. The renderer reads static faces, not
  variable axes, so the prototype's Archivo widths are the static width instances: stretch 62-70 % is ExtraCondensed,
  90 % SemiCondensed, 108-116 % SemiExpanded, 100 % the normal width. Only the files a template names are in its
  folder, with the licence text beside them.
  **Script coverage.** `year-ring` and `horizon` set their text in Archivo, which covers Latin, Latin Extended and
  Vietnamese but no Cyrillic or Greek; every Archivo font asset lists a Noto Sans file (the weight and, in `horizon`,
  the width of the Archivo file) as its `fallback`, so Cyrillic and Greek names, descriptions and messages are drawn
  from Noto Sans in those two templates. The `horizon` code and label text in Geist Mono and `pinscreen`'s Geist and
  Geist Mono cover Latin, Latin Extended and Cyrillic (the Slavic languages, not every historic letter), but of Greek
  only Λ, Ω, λ, μ, π (and ω in Geist): other Greek letters in a Geist or Geist Mono text are not drawn there. No
  template font has emoji or CJK glyphs: such a name or commit message is not drawn, takes no space, and the render
  warns `missing-glyph` ([renderer](renderer.md)). To cover more, add a font asset that has the script and list it in
  the `fallback` of the design's fonts ([design format](design-format.md#assets);
  [fonts](fonts.md#script-coverage-of-the-bundled-templates)), and mind the size budget below. A dropped emoji takes no space, so
  what follows a text in `pinscreen` (the status bar: separator, "last push", the ticker) is placed by the layout
  after the text as drawn. The `pinscreen` bar follows the branch as drawn (at least 80 px, wider for a long branch name), and without a GitHub status it closes up: the last push and its separator start right after the branch. Whatever follows the width of a text that may hold any character is bound to its drawn
  width (`textWidth`, `truncateWidth`, [expressions](expressions.md#filters)), so a dropped emoji moves nothing: the
  `horizon` name's font size, the slots of the `horizon` commit ticker and worked-with band, the `pinscreen`
  contact underline and stack parentheses, the `horizon` and `year-ring` contact pills, the contacts cut to their
  room (the `horizon` and `year-ring` ones are placed by their width, not wrapped in a box, so they never break), the
  `pinscreen` repository line (the `:`, `Project` and `{` after the name follow its drawn width, so a name with undrawn characters leaves no gap), the `pinscreen` ticker's cut and the `pinscreen` and `year-ring` ticker travel. A few texts that can only be ASCII
  are still placed by counting characters: in `pinscreen`, the login in Geist Mono (0.6 em a
  character, exact); in `year-ring`, the row under the year (Today, the longest streak and the busiest weekday, all
  generated, in Archivo Regular 12) is centred by 6.2 px a character, an estimate that may leave it slightly off
  centre; it holds no free text, so no dropped character can move it. The row lists only what the year draws: Today
  only when the calendar has days, the streak only for a run of two or more days (the same rule as its marker), the
  busiest weekday only when a day has contributions; the remaining items are centred by the same estimate. Archivo has no arrow or star glyph
  either: the contact arrow and the worked-with stars are paths.

### Settings file

Each template folder ships a `settings.json`: the personal texts of every section by name, at the component defaults, for
you to fill in once.

```json
{
  "header": { "intro": "I build developer tools." },
  "footer": { "headline": "Open to new projects." }
}
```

Pass it as the Action input `props-file` (`props-file: readmint/designs/year-ring/settings.json`) or the CLI option
`--props`. Each entry is merged into the root component of the section's light design and its `.dark` twin, wins over
the same prop in the design, and is checked like any prop: an undeclared prop or a wrong type fails, naming the section
and the prop ([cli.md](cli.md#settings-file), [action.md](action.md#settings-file)). `theme` and `slot` are not in the
file; they stay in the designs (a test pins that the file covers every other root prop at its component default). The
design format is unchanged: a merged design is an ordinary design, and the preview and a render of a design with the
props written into it are byte-identical.

### The examples repository

[MrLarkyy/readmint-template-test](https://github.com/MrLarkyy/readmint-template-test) runs the three templates with the Action: per template its `designs/` (the
folder above: the template designs byte for byte, the fonts, and a `settings.json` with the personal texts of `profileExampleProps`, set through the Action input `props-file`, which the pinned release carries), the SVGs the Action wrote to
`readmint/`, a README with the snippet and one workflow with a step per template. To use one, copy its `designs/`
folder and its step. The designs and READMEs there are generated, never edited by hand, from the template folders by
`@readmint/examples` (a package of this repository, not published):

```
pnpm examples <path to a clone of the examples repository>
pnpm examples <path to a clone of the examples repository> --check
```

The first writes the files (and removes the generated ones that are no longer produced, never `<template>/readmint/`);
`--check` writes nothing, lists each missing, differing or stale file and exits 1 when the clone is not in sync. Run it
after changing a template or `profileExampleProps`, then commit and push the clone. `--login` and `--action` set the
account and the Action reference (`MrLarkyy` and `MrLarkyy/Readmint@v0.4.0` by default). The generator refuses an Action reference pinned to a release older than the filters the templates use
(`textWidth`, `truncateWidth`), than the layer properties they set (`let` of the Horizon and Pinscreen sections and of the Year Ring ones,
`orbit` of the Year Ring year and header, `maxLines` of its repository cards, all v0.4.0; looked up as keys of the
layers, not in texts), than a root `palette` (v0.4.0; looked up as a key of the document only) or than `props-file`
(v0.3.0), which the generated `settings.json` needs, for the write and for `--check`. Examples that use `maxLines`,
`let`, `orbit` or `palette` need the v0.4.0 tag or newer and refuse every earlier pin: the Action bundle exists only
on release tags ([action](action.md#releases)), and the default is bumped with every release.

### Data the templates read

These fields are part of the [GitHub data object](data-github.md); the loader fills them (`--github`, the Action). A
template reads them as optional (a missing property reads as `null`, see [expressions](expressions.md#semantics))
and shows a plain line where they are missing: with a token that cannot read them (the Actions `GITHUB_TOKEN` may
not read the status or the pinned items), when GitHub refused the request (`meta.partial`), or with a data file
(`data-file`, `--data`) that leaves them out:

| path                                      | type           | used by                                                                     |
| ----------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| `github.status.message`                   | string \| null | `horizon` header (status), `pinscreen` header (status bar)                  |
| `github.pushes[]`                         | array          | last push, recent work, commit ticker, git log: items below                 |
| `github.pushes[].repository`, `.hash`     | string         | repository name and short hash of the push                                  |
| `github.pushes[].message`                 | string         | commit message                                                              |
| `github.pushes[].additions`, `.deletions` | number         | lines added and removed                                                     |
| `github.pushes[].date`                    | timestamp      | "today", "yesterday", "n days ago" against the calendar's last day          |
| `github.pinned[]`                         | array          | the pinned repositories, same items as `github.repositories[]` (else those) |
| `github.pinned[].weeklyCommits`           | number[52]     | the 52-week line (`year-ring`) and bar code (`horizon`) of a repository     |

Without these, `year-ring` shows "No recent push yet." and "No recent pushes yet.", `horizon` "No commits to show yet."
and `pinscreen` "no pushes yet" and "no commits yet"; the sections that do not read them render in full.

### Raster export of the long loops

A profile section that never stops moving loops over 54 or 60 seconds, and the loop is part of its look in SVG (the
ring turns once a minute, the ticker runs whole runs, the year's total counts up again every minute), so the
templates keep it. A WebP, APNG or GIF of one is a different matter: 30 frames a second of 60 seconds is 1800 frames,
and at the default scale 2 even 3 frames a second of the widest sections nearly fill the pixel budget. Raster export
therefore samples such a loop at the highest whole frame rate that fits the frame and pixel limits and says so
([raster.md](raster.md#timing-and-looping)); the one-shot sections (footers, stacks, the repository slots of
`horizon` and `pinscreen`, the index and recent work of `year-ring`) keep 30 frames a second (GIF 25). The limit that
is left is the 5 MiB of the file, which depends on how much of the picture moves: an export that passes it is encoded again at a
lower rate ([raster.md](raster.md#timing-and-looping)) until it fits. The frame rate each section ends at with the
defaults (light theme, the sample data, scale 2), measured; the second column is the highest rate the frame and pixel
limits allow:

| section                        | limits allow | WebP | APNG | GIF                                      |
| ------------------------------ | ------------ | ---- | ---- | ---------------------------------------- |
| `year-ring` `repo-1`..`repo-6` | 16           | 16   | 16   | 16; `repo-1` and `repo-4` 11, `repo-2` 9 |
| `year-ring` `header`           | 5            | 1    | 1    | 2                                        |
| `year-ring` `year`             | 3            | none | none | 1                                        |
| `horizon` `header`             | 5            | 5    | 5    | 5                                        |
| `horizon` `ticker`             | 16           | 6    | 3    | 9                                        |
| `horizon` `year`               | 3            | 3    | 3    | 1                                        |
| `horizon` `worked`             | 16           | 7    | 3    | 7                                        |
| `pinscreen` `header`           | 4            | 4    | 4    | 2                                        |
| `pinscreen` `year` (54 s)      | 4            | 4    | 4    | 4                                        |
| `pinscreen` `log`              | 5            | 5    | 5    | 1                                        |

Every section exports in every format except `year-ring` `year` as WebP and APNG: at scale 2 even its first frame and
one more pass 5 MiB, so those two fail with `raster-output-too-large`, an error that says 1 fps was tried and
names the scale; it is SVG only (or GIF) at scale 2. At scale 1 it exports as WebP or APNG at 1 frame a second. A section that ends at a low rate is a slideshow:
give a lower `scale` for a smoother one. A `repo-N` slot of `year-ring` is 960 frames at 16 fps, about 15 to 65
seconds of work for each export format.

### Writing a template like these

- **The first frame is the final state.** The raster export draws frame 0, and so do a viewer that ignores CSS and a
  reader who asks for less motion. A one-shot track (odometer, typewriter wipe, bar growth, line drawing, fade) lists
  its keyframes as `[final@0, initial@0, ..., final@1]`: the equal offsets make a jump, so the static attribute and
  frame 0 are the final value, and a browser shows the start for the instant after it. A delay holds the first value
  (the final one), so a one-shot that starts later sits in a group whose own track lasts exactly the delay and holds
  the child's start look until then (opacity 0, or the odometer column on "0"); the delay may then come from data or a
  repeat index. A test compares frame 0 with the frame at the end of every section.
- **One timeline per design.** The heading strips and footers are static. A section whose motion never ends (the
  turning ring, a ticker, a pulsing dot, the ripple, a blinking caret) loops (`loop: true`, 60000 ms; the Pinscreen year
  54000 ms, six ripples), and its one-shots play again once per loop; every other section plays once, `loop: false`. A
  loop whose period is shorter than the timeline (a ping every 2 s, a caret blinking every second, the Pinscreen pins
  bouncing every 9 s) is one cycle of a few keyframes with `cycles` ([design-format.md](design-format.md#animation)):
  `duration` is the period and `cycles` the periods in the run, and a cycle that ends where it starts joins the next
  without a duplicate keyframe; every period divides the timeline, so the loop is seamless. The rewrite from unrolled
  tracks and layer copies to cycles (RM-143) took the 26 files with such a pulse from 17764 to 11656 lines: Horizon
  header 657 to 416 and year 703 to 462, Pinscreen header 902 to 572, log 705 to 527 and year 416 to 369, Year Ring
  header 900 to 570, year 831 to 590 and each repository card 628 to 387 (light and dark alike). A loop is never shortened to suit the raster export:
  it samples a long loop at a lower rate instead (above).
- **Tickers by measured width.** A ticker gives each item a slot as wide as its texts as drawn (`textWidth` of the
  repository name and message, fixed widths for the hash, date and gaps), clipped to the slot, so the width of one run
  is known in the design and the band moves by whole runs per timeline.
- **A 3D ring on orbits.** Every day of the Year Ring (and of the header's small ring) is one group with an
  `orbit` ([design-format.md](design-format.md#orbit)): its angle from the day's index, `speed: -6` (one turn back per
  60 s loop), upright, so the line stands straight all the way round; the renderer draws it as two counter-rotating
  arms without trigonometry, and all copies share their two turn rules. The ellipse is the one the prototype's
  perspective ring draws; the far half fades under a soft ellipse of the page colour. The month labels sit on an
  ellipse of their own below the ring's base (radius 314.99 by 89.87, so each keeps its place under its tick as before)
  and fade with the orbit's `fade` (opacity 1.7 sin t - 0.15), not with keyframes. The rewrite on orbits (RM-111)
  took `year.json` from 1397 to 831 lines and 20 to 4 levels of layers, `header.json` from 1074 to 900 lines and 9
  to 5 levels; ticks and dots stay within 0.02 px of the nested-group version over the loop, the label opacity within
  0.15 (the old table floored the angle to 5 degrees).
- **Perspective without a camera.** The Horizon terrain and the Pinscreen pins project each point with the prototype's
  camera as plain arithmetic (`x = cx + f X / z`, `y = cy - f Y / z` after one fixed tilt), per vertex in bindings.
  The terrain is 52 weeks by 12 rows of quads, anchored at the calendar's last day (its column is the last; a day's
  row is its `weekday`), so any calendar of 364 to 371 days fills the grid; each weekday row is smoothed along the
  weeks (two passes of 1-2-1), every second row is the mean of two weekdays, the quads are drawn back to front, shaded
  by their slope against a light from the upper left, tinted with the accent above half the height and 0.15 above the
  root of the mean day (so a calendar of near constant counts stays a grey plateau, never an orange band), and
  outlined a few shades off their fill. Heights are the root of a count over the root of the largest, both from the
  same table and capped at 1, so no peak rises past the totals above the terrain. A test checks the rows' order and that the grid has no hole for every length from 364 to 371.
- **Square root without a filter.** The expression language has no square root: day counts use chords of the root
  through the squares 0, 1, 4, 9, 16, 36, 64, 100, 169, 256, 400, 1024, 4096 and 16384; the terrain's smoothed values
  and its largest count look the root up in a table of sixteenths.
- **Values computed once.** A `let` binds values for a layer and everything below it, in order, each entry reading the
  ones before it (the Year Ring's ring and legend, the Horizon and Pinscreen sections' derived widths and tables). A
  template never binds a value with a one-item `repeat` (`"each": "{{ [expr] }}"`): that costs a wrapper `<g>` and a
  nesting level per name, and a test fails on one. A binding holds at most 2048 characters, so long work (the weekday sums) is split into several
  entries. The largest
  count of a year needs none: `days | max("count")` is one binding ([expressions.md](expressions.md)).
- **Text without measuring.** Geist Mono advances 0.6 em, so a token of the Pinscreen code sits at `columns x 6.9`
  pixels (what follows a repository name sits after the name's drawn width instead); short free text is cut by character count with `truncate` (the header, log, stack and repository texts, the
  footer's contact label), and longer prose that is not cut (the header's role and intro, the footer's headline and note)
  is held in a `clip` group. Two texts are cut by drawn width instead (`truncateWidth`): the header's latest-push
  ticker (also in a `clip` group), to the room the status bar leaves it, and the footer's contact text, to 300 px after `truncate(34)`; the header's branch chip and status message and the stack's items are cut by count and
  then measured with `textWidth` to place what follows them. A clip group (or other layer of its own) lying
  wholly off the canvas draws nothing there; the renderer leaves it out ([renderer.md](renderer.md#layers)), so such a
  design still renders and rasterizes. A few far layers are still written (a stroke whose joins are padded by twice its
  width (at an arc, a nearly straight curve or a short segment), a path whose control points or arc box reach the canvas
  while its curve lies far, and text in a font whose `head` box overstates its glyphs); raster export of those refuses
  with `raster-image`, so keep layers on the canvas.

### Bytes per section

UTF-8 bytes of the animated SVG of the files as published, on the sample data of the tests and on the worst-case data
(1024-character texts, counts of 10^15, 600 pushes, a 54-column calendar at 1000000 a day); every section is within
the budget below. The repository slots weigh alike; `work` is 5 to 7 KB.

| template    | section | sample | worst case |
| ----------- | ------- | ------ | ---------- |
| `year-ring` | header  | 151 KB | 162 KB     |
| `year-ring` | year    | 168 KB | 184 KB     |
| `year-ring` | index   | 10 KB  | 7 KB       |
| `year-ring` | recent  | 28 KB  | 88 KB      |
| `year-ring` | repo-1  | 16 KB  | 26 KB      |
| `year-ring` | footer  | 10 KB  | 10 KB      |
| `horizon`   | header  | 16 KB  | 24 KB      |
| `horizon`   | ticker  | 34 KB  | 31 KB      |
| `horizon`   | year    | 121 KB | 112 KB     |
| `horizon`   | repo-1  | 45 KB  | 53 KB      |
| `horizon`   | stack   | 10 KB  | 9 KB       |
| `horizon`   | worked  | 3 KB   | 3 KB       |
| `horizon`   | footer  | 8 KB   | 8 KB       |
| `pinscreen` | header  | 23 KB  | 30 KB      |
| `pinscreen` | year    | 184 KB | 198 KB     |
| `pinscreen` | repo-1  | 12 KB  | 12 KB      |
| `pinscreen` | log     | 27 KB  | 27 KB      |
| `pinscreen` | stack   | 13 KB  | 13 KB      |
| `pinscreen` | footer  | 5 KB   | 5 KB       |

The ring of the Year Ring prototype was about 390 KB; sharing the turn rules between the days brought it to 241 KB with
a dot for every day without commits, and drawing each day on an orbit (six groups instead of nine, no keyframes per
label) to 168 KB, under the 256 KiB the ring is held to on the sample data.

## Size budget

Every calendar template, and a custom cell like the one above, renders the worst-case calendar (54 columns of 7 days, every
count 1000000) within **256 KiB** (262144 bytes of UTF-8) and within half the default `maxExpressionSteps` and
`maxRepeatCopies`, so a calendar leaves room for the rest of a README graphic. A test pins it; a template over budget
gets lighter markup, the budget is never raised to let it pass. Today the heatmap and the dots take about 37 KB, the
isometric template about 123 KB.

The starter templates render the worst-case GitHub data (1024-character name, login and bio, 600 languages with
1024-character names, counts of 10^15, a 54-column calendar at 1000000) within **512 KiB** and the same half work
limits; a test pins it too.

The profile templates render every section on the worst-case data of the starters (and 600 pushes, six repositories
with 1024-character texts) within **512 KiB** and the same half work limits; the year ring is held to **256 KiB** on the
sample data. A test pins both; the numbers per section are in [Profile templates](#profile-templates).
