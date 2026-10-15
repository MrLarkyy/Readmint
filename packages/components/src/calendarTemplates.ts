/**
 * The contribution calendar templates, each a plain v0 design at `@readmint/components/templates/<name>.design.json`
 * that renders `github.contributions` (docs/components.md).
 */
export const calendarTemplates = Object.freeze([
  "calendar-heatmap",
  "calendar-isometric",
  "calendar-dots",
] as const);

export type CalendarTemplate = (typeof calendarTemplates)[number];
