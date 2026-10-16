import { parseDesign, type ComponentDefinition, type Design } from "@readmint/format";
import { renderSvg, type RenderLimits } from "@readmint/renderer";
import type { CalendarTemplate } from "../src/index.js";
import dots from "../templates/calendar-dots.design.json?raw";
import heatmap from "../templates/calendar-heatmap.design.json?raw";
import isometric from "../templates/calendar-isometric.design.json?raw";

/** The template files as published, read as text in Node and in the browser alike. */
export const templateSources: Readonly<Record<CalendarTemplate, string>> = {
  "calendar-heatmap": heatmap,
  "calendar-isometric": isometric,
  "calendar-dots": dots,
};

/** A fresh, validated copy of a template; a template that does not validate fails the test naming its issues. */
export function loadTemplate(name: CalendarTemplate): Design {
  const result = parseDesign(templateSources[name]);
  if (!result.ok) throw new Error(`${name} does not validate: ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** The calendar instance's props replaced; a literal `canvas` replaces the template's size, which follows the props. */
export function withCalendar(
  design: Design,
  props: Readonly<Record<string, string | number | boolean>>,
  canvas?: { readonly width: number; readonly height: number },
): Design {
  const [calendar, ...rest] = design.layers;
  if (calendar?.type !== "component") throw new Error("the template has no calendar instance");
  return {
    ...design,
    canvas: { ...design.canvas, ...canvas },
    layers: [{ ...calendar, props: { ...calendar.props, ...props } }, ...rest],
  };
}

/**
 * A replacement cell: a triangle whose height follows the day's count, in its own colour scale (it ignores `color`).
 * It declares every prop the calendar passes, as a custom cell must.
 */
export const triangleCell: ComponentDefinition = {
  description: "A triangle rising with the day's count, in a warm colour scale of its own.",
  props: {
    level: { type: "number", default: 0 },
    count: { type: "number", default: 0 },
    date: { type: "string", default: "" },
    index: { type: "number", default: 0 },
    week: { type: "number", default: 0 },
    weekday: { type: "number", default: 0 },
    size: { type: "number", default: 11 },
    radius: { type: "number", default: 2 },
    height: { type: "number", default: 0 },
    color: { type: "color", default: "#ebedf0" },
  },
  layers: [
    {
      type: "path",
      d: "M0 {{ props.size }} L{{ props.size / 2 }} {{ props.size - ((props.count | min(10)) / 10 * (props.size - 2) + 2) | round(2) }} L{{ props.size }} {{ props.size }} Z",
      fill: '{{ ["#eaeef2", "#ffd8a8", "#ffa94d", "#f76707", "#c92a2a"][props.level] }}',
    },
  ],
};

/** The heatmap template with `components.cell` replaced by `triangleCell`. */
export function customCellDesign(): Design {
  const design = loadTemplate("calendar-heatmap");
  return { ...design, components: { ...design.components, cell: triangleCell } };
}

export interface CalendarRender {
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly limits?: Partial<RenderLimits>;
}

/** Renders a calendar; a failed render throws naming the issues. */
export function renderCalendar({ design, data, limits }: CalendarRender): string {
  const result = renderSvg(design, { data, ...(limits === undefined ? {} : { limits }) });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}
