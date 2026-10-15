import { validateDesign, type Design } from "@readmint/format";
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
