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

## Size budget

Every template, and a custom cell like the one above, renders the worst-case calendar (54 columns of 7 days, every
count 1000000) within **256 KiB** (262144 bytes of UTF-8) and within half the default `maxExpressionSteps` and
`maxRepeatCopies`, so a calendar leaves room for the rest of a README graphic. A test pins it; a template over budget
gets lighter markup, the budget is never raised to let it pass. Today the heatmap and the dots take about 37 KB, the
isometric template about 123 KB.
