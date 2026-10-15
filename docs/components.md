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
`percent` and `date` filters, and a missing name, bio or language colour falls back with `default()`.

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
  you may embed) to set the banner in your own font.
- **Long and missing data.** Names are cut with `truncate`, counts shortened with `compact`, the language list shows
  six rows (`repeat` with `if: {{ i < 6 }}`; a dropped copy takes no slot) or a "No language data yet." line, and a
  streak of 0 days shows "No streak". Golden images pin the light and dark look of every template and the
  worst-case data (1024-character strings, 10^15 counts).
- **The sample data** the goldens render is synthetic (an invented account, `readmint-sample`), shaped like the
  data-github object.

## Size budget

Every calendar template, and a custom cell like the one above, renders the worst-case calendar (54 columns of 7 days, every
count 1000000) within **256 KiB** (262144 bytes of UTF-8) and within half the default `maxExpressionSteps` and
`maxRepeatCopies`, so a calendar leaves room for the rest of a README graphic. A test pins it; a template over budget
gets lighter markup, the budget is never raised to let it pass. Today the heatmap and the dots take about 37 KB, the
isometric template about 123 KB.

The starter templates render the worst-case GitHub data (1024-character name, login and bio, 600 languages with
1024-character names, counts of 10^15, a 54-column calendar at 1000000) within **512 KiB** and the same half work
limits; a test pins it too.
