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

Three full README profiles, each a folder of designs under `@readmint/components/templates/profiles/<name>/`:

| template    | look                                                                                                     | fonts (SIL OFL 1.1)           | year visual                                            |
| ----------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `year-ring` | calm and cobalt; header with a typed last push, index table, recent work, repositories with 52-week line | Archivo                       | a rotating 3D ring, one line per day, streak in cobalt |
| `horizon`   | an orange poster: name in large type, commit ticker, ranked repositories, stack columns and a ticker     | Archivo Condensed, Geist Mono | a lit 3D terrain with a peak per day                   |
| `pinscreen` | an IDE: status bar header, repositories as Kotlin objects, a terminal git log, a build script stack      | Geist, Geist Mono             | a pin screen with a ripple from today                  |

`profileTemplates` from `@readmint/components` maps each name to its sections (`ProfileTemplate`, `ProfileSection`).
A folder holds, per section, `<section>.json` and its dark twin `<section>.dark.json`, an example `README.md` and
`fonts/` (the TTF files the designs name, the licence of each family and the sha256 of every file):

| template    | sections                                                            |
| ----------- | ------------------------------------------------------------------- |
| `year-ring` | `header`, `year`, `index`, `recent`, `repo-1` to `repo-4`, `footer` |
| `horizon`   | `header`, `year`, `repo-1` to `repo-4`, `stack`, `footer`           |
| `pinscreen` | `header`, `year`, `repo-1` to `repo-4`, `log`, `stack`, `footer`    |

- **One design per section.** Every section is a design of 840 pixels width with a transparent canvas that draws its
  own panel, so each is an image of its own in the README. The Action writes `readmint/<section>.svg` and
  `readmint/<section>.dark.svg` and prints the `<picture>` snippet that switches on `prefers-color-scheme`
  ([action.md](action.md#outputs-on-disk-and-the-dark-variant)): list only the light designs. The dark twin is the
  light file with the root prop `theme` set to `"dark"`, nothing else (a test compares them); the colours are chosen
  from that prop inside the design.
- **Links.** SVG links do not work inside an `<img>`, so a clickable element is a link around the image: the example
  `README.md` wraps each repository and the contact footer.
- **Repository slots.** `repo-1` to `repo-4` are the same design with the root prop `slot` 0 to 3 (a test pins that
  they differ in nothing else). A slot shows `github.pinned[slot]`, else `github.repositories[slot]` (stars
  descending); a slot past the list shows a plain "No repository in slot n." line.
- **No user in a design.** No design contains a login, name or address; every text comes from `github.*`, so another
  account's data needs no edit. The "data as of" date is `github.contributions.to`: a render reads no clock.
- **Fonts.** Archivo, Archivo Condensed (Omnibus-Type), Geist and Geist Mono (Vercel) are SIL OFL 1.1 static TTFs, byte
  copies of the upstream files (origin, version and sha256 in each `fonts/README.md`), none with a Reserved Font Name
  and all with OS/2 `fsType` 0, so the renderer embeds a subset of the glyphs a section draws. Only the files a
  template names are in its folder, with the licence text beside them. Archivo and Archivo Condensed have no Cyrillic
  and none of the four families has emoji or CJK glyphs: such a name or commit message is not drawn and the render
  warns `missing-glyph` ([renderer](renderer.md)). Add a font asset that has them and list it in the `fallback` of the
  design's fonts ([design format](design-format.md#assets)), and mind the size budget below.

### Data the templates read

Everything but the fields below is the [GitHub data object](data-github.md). The loader does not produce those fields
yet, so a template reads them as optional (a missing property reads as `null`, see
[expressions](expressions.md#semantics)) and shows a plain line where they are missing; pass them in a data file
(`data-file`, `--data`) until the loader does:

| path                                      | type           | used by                                                                 |
| ----------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `github.status.message`                   | string \| null | `horizon` header (status), `pinscreen` header (status bar)              |
| `github.pushes[]`                         | array          | last push, recent work, commit ticker, git log: items below             |
| `github.pushes[].repository`, `.hash`     | string         | repository name and short hash of the push                              |
| `github.pushes[].message`                 | string         | commit message                                                          |
| `github.pushes[].additions`, `.deletions` | number         | lines added and removed                                                 |
| `github.pinned[]`                         | array          | the pinned repositories, same items as `github.repositories[]`          |
| `github.repositories[].weeklyCommits`     | number[52]     | the 52-week line (`year-ring`) and bar code (`horizon`) of a repository |

Without these, `year-ring` shows "No recent push yet." and "No recent pushes yet.", `horizon` "No commits to show yet."
and `pinscreen` "no pushes yet" and "no commits yet"; the sections that do not read them render in full.

### Writing a template like these

- **The first frame is the final state.** The raster export draws frame 0, and so do a viewer that ignores CSS and a
  reader who asks for less motion. A one-shot track (odometer, typewriter wipe, bar growth, line drawing) therefore
  lists its keyframes as `[final@0, initial@0, ..., final@1]`: the equal offsets make a jump, so the static attribute
  and frame 0 are the final value, and a browser shows the start for the instant after it. A delay would hold the
  first value (the final one), so a one-shot that starts later holds `initial` for a keyframe instead; a reveal that
  runs line by line is one panel-coloured cover whose `y` steps (at most 15 steps in the 32 keyframes of a track).
  Motions that never need a start (the turning ring, a ticker, the pulse, the ripple) start and end in their rest pose,
  and a test compares frame 0 with the frame at the end of every section.
- **One timeline per design.** The three footers and the Pinscreen repository slots are static; the other sections
  but two play once over 60000 ms (the format maximum; the ring turns once per view and rests), `loop: false`. The
  Horizon header and stack are tickers: `loop: true`, the row drawn several times and moved by exactly one set of items.
- **A 3D ring without trigonometry.** A point of an ellipse with semi-axes `R1 + R2` and `R1 - R2` is the sum of two
  counter-rotating circles. Each day is three nested groups, each only a rotation (outer `phi`, middle `-2 phi` turning
  twice as fast the other way, inner `phi` so the line stays upright), so all 365 copies share three animation rules
  and differ only in their static rotations.
- **Square root without a filter.** The expression language has no square root: heights use chords of the square root
  through 0, 1, 4, 16 and 64 (clamped at 64 a day; a chord is at most 6 % below the root).
- **Text without measuring.** Geist Mono advances 0.6 em, so a token of the Pinscreen editor sits at `columns x 8.4`
  pixels; free text is cut with `truncate` and held in a `clip` group. A clip group (or other layer of its own) lying
  wholly off the canvas draws nothing there; the renderer leaves it out ([renderer.md](renderer.md#layers)), so such a
  design still renders and rasterizes. A few far layers are still written (a path whose control points or arc box
  reach the canvas while its curve lies far, text in a font whose `head` box overstates its glyphs); raster export of
  those refuses with `raster-image`, so keep layers on the canvas.

### Bytes per section

UTF-8 bytes of the animated SVG on the sample data of the tests and on the worst-case data (1024-character texts, counts
of 10^15, 600 pushes, a 54-column calendar at 1000000 a day); every section is within the budget below.

| template    | section | sample | worst case |
| ----------- | ------- | ------ | ---------- |
| `year-ring` | header  | 31 KB  | 29 KB      |
| `year-ring` | year    | 163 KB | 204 KB     |
| `year-ring` | index   | 21 KB  | 20 KB      |
| `year-ring` | recent  | 22 KB  | 18 KB      |
| `year-ring` | repo-1  | 13 KB  | 12 KB      |
| `year-ring` | footer  | 10 KB  | 9 KB       |
| `horizon`   | header  | 36 KB  | 31 KB      |
| `horizon`   | year    | 90 KB  | 86 KB      |
| `horizon`   | repo-1  | 17 KB  | 15 KB      |
| `horizon`   | stack   | 28 KB  | 41 KB      |
| `horizon`   | footer  | 8 KB   | 8 KB       |
| `pinscreen` | header  | 19 KB  | 18 KB      |
| `pinscreen` | year    | 117 KB | 115 KB     |
| `pinscreen` | repo-1  | 15 KB  | 14 KB      |
| `pinscreen` | log     | 24 KB  | 22 KB      |
| `pinscreen` | stack   | 22 KB  | 22 KB      |
| `pinscreen` | footer  | 7 KB   | 7 KB       |

The ring of the Year Ring prototype was about 390 KB; sharing the three rotation rules between the days and leaving
out the days without commits brings it to 163 KB.

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
