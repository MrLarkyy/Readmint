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
  `projection: "isometric"`).

### Calendar options

Props of the `calendar` instance:

| prop          | type   | default         | meaning                                                                          |
| ------------- | ------ | --------------- | -------------------------------------------------------------------------------- |
| `cellSize`    | number | `11`            | side of a cell (half the width of an isometric top face)                         |
| `gap`         | number | `3`             | space between cells; the pitch is `cellSize + gap`                               |
| `radius`      | number | `2`             | corner radius, passed to the cell (the heatmap cell uses it)                     |
| `orientation` | enum   | `"horizontal"`  | `"horizontal"`: weeks are columns, weekdays rows; `"vertical"`: swapped          |
| `projection`  | enum   | `"flat"`        | `"flat"` or `"isometric"`                                                        |
| `weeks`       | number | `53`            | draw only the last this many weeks; older days are dropped by an `if`            |
| `maxCount`    | number | `20`            | count at which an isometric pillar reaches `maxHeight`; larger counts are capped |
| `maxHeight`   | number | `24`            | tallest isometric pillar; also the room left above the calendar                  |
| `level0`..`4` | color  | GitHub's greens | colour of each level (`#ebedf0`, `#9be9a8`, `#40c463`, `#30a14e`, `#216e39`)     |

`orientation` and `projection` are enum props: any other value is a validation issue (`enum`), or a `type` render issue
when it comes from data.

**Canvas.** The canvas cannot read the instance props, so each template states its size from the same numbers:
`min(weeks, 53) * 14 - 3 + 16` by `111` for the flat ones, `(min(weeks, 53) + 5) * 14 + 38` by
`(min(weeks, 53) + 5) * 7 + 51` for the isometric one (`14` is the pitch, `16` twice the margin of 8). Changing
`cellSize`, `gap`, `weeks`, `maxHeight` or `orientation` means changing the canvas binding with them.

**Projections.** Flat: a cell sits at `column * pitch`, `weekday * pitch` (swapped when vertical); `height` is 0.
Isometric: a cell sits at `x = (column - weekday + 6) * pitch`, `y = (column + weekday) * pitch / 2 + maxHeight`, and
`height = min(count, maxCount) / maxCount * maxHeight`, rounded to 2 decimals. Days are drawn in data order, ascending
by week and weekday; in the isometric projection that is back to front, because a later day that lies further back is
at least two pitches to the side and never overlaps an earlier one.

**Colour scale.** `color = [level0, level1, level2, level3, level4][day.level]`, `level0` for a level outside 0..4.

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
  `enum` issue. A canvas cannot read props, which is why the theme is not a `background`.
- **The calendar.** `isometric-card` and `profile-card` carry the `calendar` and `cell` components of the
  calendar templates above unchanged (a test compares them); only the instance's props differ.
- **Fonts.** Text needs a font asset. The templates use Montserrat Medium and ExtraBold from `templates/fonts/`
  (SIL Open Font License 1.1, `OFL.txt` and the sha256 of each file beside them); their `src` is the relative path
  `fonts/Montserrat-Medium.ttf`, resolved against the design file by the CLI and the Action. The banner names its
  headline font `display`: replace its `src`, `family` and `licence` (keep `embedding: "allowed"` only for a font
  you may embed) to set the banner in your own font. Montserrat has no CJK, Arabic, Devanagari or emoji glyphs: a name or bio in those is not drawn and the render warns `missing-glyph`. Add a font asset that has them and list it in the `fallback` of `body`, `bold` and `display` ([design format](design-format.md#assets)), and mind the size budget below.
- **Long and missing data.** Names are cut with `truncate`, counts shortened with `compact`, the language list shows
  six rows (`repeat` with `if: {{ i < 6 }}`; a dropped copy takes no slot) or a "No language data yet." line, and a
  streak of 0 days shows "No streak". Golden images pin the light and dark look of every template and the
  worst-case data (1024-character strings, 10^15 counts).
- **The sample data** the goldens render is synthetic (an invented account, `readmint-sample`), shaped like the
  data-github object.

## Profile templates

Three full README profiles, each a folder of designs under `@readmint/components/templates/profiles/<name>/`, built
section by section to the approved prototype (version 6):

| template    | look                                                                                                     | fonts (SIL OFL 1.1)                                         | year visual                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `year-ring` | calm and cobalt; a typed last push, an index table, recent work, repository cards with a 52-week line    | Archivo (normal and SemiExpanded)                           | a turning 3D ring, one line per day, the longest streak marked |
| `horizon`   | an orange poster: the name full width, a commit ticker, repositories ranked by stars, stack, worked with | Archivo (ExtraCondensed, SemiCondensed, normal), Geist Mono | a lit, shaded 3D terrain whose peaks turn orange               |
| `pinscreen` | an editor: a status bar, repositories as Kotlin objects, a terminal git log, a build script stack        | Geist, Geist Mono                                           | a wall of pins with a ripple running out from today            |

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
- **Repository slots.** `repo-1` to `repo-6` are the same design with the root prop `slot` 0 to 5 (a test pins that
  they differ in nothing else). A slot reads `github.pinned` (the loader fills it, see
  [pinned repositories, pushes and status](data-github.md#pinned-repositories-pushes-and-status)), or
  `github.repositories` where the data has no pinned list. In `year-ring` and `pinscreen` slot n shows the n-th of that list;
  `horizon` ranks its first six by stars (ties keep their order) and slot n shows the n-th. A slot past the list shows
  a plain "No repository in slot n." line (`pinscreen`: an empty file); a repository without `weeklyCommits` shows
  no line (`year-ring`) and flat bars (`horizon`).
- **Personal texts are root props.** What only a person can say (an introduction, a role, index rows, stack groups,
  the people worked with, the footer and the contact) is a prop of the root instance, declared per section with an
  empty default; an empty prop hides its block (an empty introduction falls back to `github.bio`, an empty contact to
  the GitHub address). A prop is set in the light design and the same in its twin. Array props hold strings only, so a
  table is two arrays of the same length (`labels`, `values`), and a multi-line item is one string with line breaks.
  Each template's `README.md` lists its props with neutral examples. The canvas height cannot read a prop, so the
  sections whose rows come from props have a fixed height (the `year-ring` index takes up to 8 rows, the `pinscreen`
  build file up to 15 lines); the sections whose rows come from data (recent work, the git log) grow with them.
- **No user in a design.** No design contains a login, name, address or personal text; every other text comes from
  `github.*`, so another account's data needs no edit. The render date is `github.contributions.to`: a render reads no
  clock, so times are days ("today", "yesterday", "3 days ago", read from the calendar's own dates), never hours.
- **Fonts.** Archivo (Omnibus-Type), Geist and Geist Mono (Vercel) are SIL OFL 1.1 static TTFs, byte copies of the
  upstream files (origin, version and sha256 in each `fonts/README.md`), none with a Reserved Font Name and all with
  OS/2 `fsType` 0, so the renderer embeds a subset of the glyphs a section draws. The renderer reads static faces, not
  variable axes, so the prototype's Archivo widths are the static width instances: stretch 62-70 % is ExtraCondensed,
  90 % SemiCondensed, 108-116 % SemiExpanded, 100 % the normal width. Only the files a template names are in its
  folder, with the licence text beside them. Archivo has no Cyrillic and none of the families has emoji or CJK glyphs:
  such a name or commit message is not drawn and the render warns `missing-glyph` ([renderer](renderer.md)). Add a
  font asset that has them and list it in the `fallback` of the design's fonts
  ([design format](design-format.md#assets)), and mind the size budget below. A dropped emoji takes no space, so
  what follows a text in `pinscreen` (the status bar: separator, "last push", the ticker) is placed by the layout
  after the text as drawn. Four places still size by `length`, which counts a dropped emoji as a character, so with
  an emoji in the text they err on the safe side: the `horizon` name's font size (smaller, the name fills less of
  the width; pinned by the `header-emoji` golden) and the `pinscreen` contact underline (longer than the text;
  pinned by a test). The width the `pinscreen` ticker may take (it truncates earlier) and the `year-ring` and
  `pinscreen` ticker travel (it scrolls a little further than the text) are not pinned by a golden or a test
  (the `header-emoji` goldens are frames at time 0 and do not truncate the push text). Archivo has no arrow or star glyph
  either: the contact arrow and the worked-with stars are paths.

### The examples repository

[MrLarkyy/readmint-template-test](https://github.com/MrLarkyy/readmint-template-test) runs the three templates with the Action: per template its `designs/` (the
folder above with the personal texts of `profileExampleProps` filled in, plus the fonts), the SVGs the Action wrote to
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
account and the Action reference (`MrLarkyy` and `MrLarkyy/Readmint@v0.1.0` by default).

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
  loop whose period is shorter than the timeline needs more keyframes than a track holds (32), so it is a few copies of
  its layer (a `repeat` over a short list with `stagger`), each playing a window of whole periods and invisible outside
  it; every period divides the timeline, so the loop is seamless.
- **Tickers without measuring.** A ticker gives each item a slot as wide as its estimated text (characters times an
  average advance; Geist Mono exactly 0.6 em), clipped to the slot, so the width of one run is known in the design and
  the band moves by whole runs per timeline.
- **A 3D ring without trigonometry.** A point of an ellipse with semi-axes `R1 + R2` and `R1 - R2` is the sum of two
  counter-rotating circles. Each day is three nested groups, each only a rotation (outer `phi`, middle `-2 phi` turning
  twice as fast the other way, inner `phi` so the line stays upright), so all 365 copies share three animation rules
  and differ only in their static rotations. The ellipse is the one the prototype's perspective ring draws; the far
  half fades under a soft ellipse of the page colour, and the month labels, set below the ring's base, fade in and
  out with a cosine looked up in a table.
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
- **Values computed once.** A one-item `repeat` binds a value for everything below it (`"each": "{{ [expr] }}"`). A
  binding holds at most 2048 characters, so long work (the weekday sums) is split into a chain of such bindings. The largest
  count of a year needs none: `days | max("count")` is one binding ([expressions.md](expressions.md)).
- **Text without measuring.** Geist Mono advances 0.6 em, so a token of the Pinscreen code sits at `columns x 6.9`
  pixels; free text is cut with `truncate` and held in a `clip` group. A clip group (or other layer of its own) lying
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
| `year-ring` | header  | 219 KB | 232 KB     |
| `year-ring` | year    | 241 KB | 259 KB     |
| `year-ring` | index   | 10 KB  | 34 KB      |
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

The ring of the Year Ring prototype was about 390 KB; sharing the three rotation rules between the days brings it to
241 KB with a dot for every day without commits, under the 256 KiB the ring is held to on the sample data.

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
