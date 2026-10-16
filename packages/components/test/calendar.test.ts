import { applyDesignProps, validateDesign, type Design } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { calendarTemplates } from "../src/index.js";
import {
  customCellDesign,
  loadTemplate,
  renderCalendar,
  templateSources,
  withCalendar,
} from "./calendarDesigns.js";
import {
  contributionsYear,
  emptyContributions,
  worstCaseContributions,
} from "./contributionsFixture.js";

/** UTF-8 bytes one calendar may take on the worst-case year (docs/components.md). */
const calendarSizeBudget = 262_144;

/** Half the default work limits: a calendar must leave room for the rest of a README design. */
const halvedLimits = {
  maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
  maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
};

const utf8Bytes = (svg: string) => new TextEncoder().encode(svg).length;

/** Every string value of a JSON document, with its pointer. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((item, index) => strings(item, `${path}/${String(index)}`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}/${key}`));
  }
  return [];
}

describe.each(calendarTemplates)("%s", (name) => {
  test("validates with no issues", () => {
    expect(validateDesign(JSON.parse(templateSources[name]))).toMatchObject({ ok: true });
  });

  test("uses no fonts, no images and no external references", () => {
    const design = loadTemplate(name);
    expect(design.assets).toBeUndefined();
    for (const [path, value] of strings(design)) {
      if (path === "/$schema") continue;
      expect(value, path).not.toMatch(/https?:|data:/u);
    }
    const svg = renderCalendar({ design, data: contributionsYear() });
    expect(svg).not.toMatch(/<image|<text|<script|href=/u);
  });

  test("renders an empty calendar with no cells", () => {
    const svg = renderCalendar({ design: loadTemplate(name), data: emptyContributions() });
    // The background, then the calendar instance with nothing in it.
    expect(svg).toMatch(/<rect [^>]*\/><g transform="translate\(8 8\)"><\/g><\/svg>$/u);
  });

  test("the same design and data give the same bytes", () => {
    const data = contributionsYear();
    expect(renderCalendar({ design: loadTemplate(name), data })).toBe(
      renderCalendar({ design: loadTemplate(name), data }),
    );
  });
});

test.each([
  ["calendar-heatmap", { orientation: "vertical", gap: 0 }, 7 * 11 + 16, 53 * 11 + 16],
  ["calendar-dots", { cellSize: 9, gap: 2, weeks: 20 }, 20 * 11 - 2 + 16, 7 * 11 - 2 + 16],
  ["calendar-isometric", { weeks: 12 }, (12 + 5) * 14 + 22 + 16, (12 + 5) * 7 + 11 + 24 + 16],
  [
    "calendar-isometric",
    { cellSize: 8, maxHeight: 10 },
    (53 + 5) * 11 + 16 + 16,
    319 + 8 + 10 + 16,
  ],
  // Fractional sizes round up to whole pixels: 252.5 high, then 728.5 by 107.5.
  ["calendar-isometric", { gap: 2, weeks: 26 }, (26 + 5) * 13 + 22 + 16, 253],
  ["calendar-heatmap", { cellSize: 10.5 }, 729, 108],
] as const)("the %s canvas follows the calendar props %j", (name, props, width, height) => {
  const data = contributionsYear();
  const bound = renderCalendar({ design: withCalendar(loadTemplate(name), props), data });
  const sized = withCalendar(loadTemplate(name), props, { width, height });
  expect(bound).toBe(renderCalendar({ design: sized, data }));
});

test("the three templates carry one identical calendar component", () => {
  const [first, ...rest] = calendarTemplates.map(
    (name) => loadTemplate(name).components?.["calendar"],
  );
  expect(first).toBeDefined();
  for (const calendar of rest) expect(calendar).toEqual(first);
});

test("the weeks option draws only the last weeks of the calendar", () => {
  const data = contributionsYear();
  const lastWeeks = data.github.contributions.days.filter((day) => day.week >= 53 - 12).length;
  const svg = renderCalendar({
    design: withCalendar(
      loadTemplate("calendar-heatmap"),
      { weeks: 12 },
      { width: 200, height: 111 },
    ),
    data,
  });
  expect(svg.match(/<rect /gu)?.length).toBe(lastWeeks + 1);
});

test("a custom cell changes shape, colour and height", () => {
  const svg = renderCalendar({ design: customCellDesign(), data: contributionsYear() });
  expect(svg).not.toMatch(/<rect [^>]*rx=/u);
  const paths = svg.match(/<path d="[^"]*" fill="#[0-9a-f]+"/gu) ?? [];
  expect(paths.length).toBe(contributionsYear().github.contributions.days.length);
  // Its own colour scale, none of the calendar's levels.
  expect(svg).toContain('fill="#c92a2a"');
  expect(svg).not.toContain('fill="#216e39"');
  // The apex follows the count: a quiet day is flat (y 9 of 11), a busy one reaches the top (y 0).
  expect(svg).toContain('d="M0 11 L5.5 9 L11 11 Z"');
  expect(svg).toContain('d="M0 11 L5.5 0 L11 11 Z"');
});

describe("size budget on the worst-case calendar", () => {
  const designs: [string, () => Design][] = [
    ...calendarTemplates.map((name): [string, () => Design] => [name, () => loadTemplate(name)]),
    ["custom cell", customCellDesign],
  ];

  test.each(designs)("%s stays within the budget and half the work limits", (_name, design) => {
    const svg = renderCalendar({
      design: design(),
      data: worstCaseContributions(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(calendarSizeBudget);
  });
});

test("an unknown orientation is an enum issue at the prop", () => {
  const design = structuredClone(loadTemplate("calendar-heatmap"));
  const result = validateDesign({
    ...design,
    layers: [{ type: "component", ref: "calendar", props: { orientation: "diagonal" } }],
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "/layers/0/props/orientation", code: "enum" }),
    );
  }
});

const lightLevels = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

describe.each(calendarTemplates)("%s theme", (name) => {
  const data = contributionsYear();
  const dark = () => withCalendar(loadTemplate(name), { theme: "dark" });

  test("declares the theme enum, light by default", () => {
    expect(loadTemplate(name).components?.["calendar"]?.props?.["theme"]).toEqual({
      type: "enum",
      values: ["light", "dark"],
      default: "light",
    });
  });

  test("an explicit light theme renders the default bytes", () => {
    const light = withCalendar(loadTemplate(name), { theme: "light" });
    expect(renderCalendar({ design: light, data })).toBe(
      renderCalendar({ design: loadTemplate(name), data }),
    );
  });

  test("the dark render has a transparent canvas and the dark level colours only", () => {
    const svg = renderCalendar({ design: dark(), data });
    expect(svg).not.toContain("#ffffff");
    for (const colour of lightLevels) expect(svg).not.toContain(colour);
    expect(svg).toContain("#161b22");
    expect(svg).toContain("#39d353");
    expect(svg).not.toMatch(/^<svg[^>]*><rect /u);
  });

  test("the empty dark calendar draws no background", () => {
    const svg = renderCalendar({ design: dark(), data: emptyContributions() });
    expect(svg).toMatch(/<g transform="translate\(8 8\)"><\/g><\/svg>$/u);
    expect(svg).not.toContain("<rect");
  });

  test("the dark render is deterministic", () => {
    expect(renderCalendar({ design: dark(), data })).toBe(renderCalendar({ design: dark(), data }));
  });

  test("applyDesignProps sets the theme like the instance does", () => {
    const applied = applyDesignProps(loadTemplate(name), { theme: "dark" });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(renderCalendar({ design: applied.value, data })).toBe(
        renderCalendar({ design: dark(), data }),
      );
    }
  });

  test("an unknown theme is an enum issue at the prop", () => {
    const result = applyDesignProps(loadTemplate(name), { theme: "sepia" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: "enum" }));
    }
    const invalid = validateDesign(withCalendar(loadTemplate(name), { theme: "sepia" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toContainEqual(
        expect.objectContaining({ path: "/layers/0/props/theme", code: "enum" }),
      );
    }
  });

  test("level2Dark changes the dark colours only, level2 the light colours only", () => {
    const red = "#ff0000";
    const render = (props: Record<string, string>) =>
      renderCalendar({ design: withCalendar(loadTemplate(name), props), data });
    expect(render({ theme: "dark", level2Dark: red })).toContain(red);
    expect(render({ theme: "light", level2Dark: red })).not.toContain(red);
    expect(render({ theme: "light", level2: red })).toContain(red);
    expect(render({ theme: "dark", level2: red })).not.toContain(red);
  });

  test("the dark calendar stays within the budget and half the work limits", () => {
    const svg = renderCalendar({
      design: dark(),
      data: worstCaseContributions(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(calendarSizeBudget);
  });
});
