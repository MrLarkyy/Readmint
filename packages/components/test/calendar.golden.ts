import { defineGoldenSuite } from "@readmint/golden";
import {
  customCellDesign,
  loadTemplate,
  renderCalendar,
  withCalendar,
  type CalendarRender,
} from "./calendarDesigns.js";
import { contributionsYear } from "./contributionsFixture.js";

const data = contributionsYear();

export default defineGoldenSuite<CalendarRender>({
  name: "calendar",
  render: renderCalendar,
  fixtures: [
    { name: "calendar-heatmap", input: { design: loadTemplate("calendar-heatmap"), data } },
    { name: "calendar-isometric", input: { design: loadTemplate("calendar-isometric"), data } },
    { name: "calendar-dots", input: { design: loadTemplate("calendar-dots"), data } },
    { name: "calendar-custom-cell", input: { design: customCellDesign(), data } },
    {
      name: "calendar-vertical",
      input: {
        design: withCalendar(
          loadTemplate("calendar-heatmap"),
          { orientation: "vertical", gap: 0 },
          { width: 7 * 11 + 16, height: 53 * 11 + 16 },
        ),
        data,
      },
    },
    {
      name: "calendar-last-weeks",
      input: {
        design: withCalendar(
          loadTemplate("calendar-isometric"),
          { weeks: 12 },
          { width: (12 + 5) * 14 + 22 + 16, height: (12 + 5) * 7 + 11 + 24 + 16 },
        ),
        data,
      },
    },
    {
      name: "calendar-heatmap-dark",
      input: { design: withCalendar(loadTemplate("calendar-heatmap"), { theme: "dark" }), data },
    },
    {
      name: "calendar-isometric-dark",
      input: { design: withCalendar(loadTemplate("calendar-isometric"), { theme: "dark" }), data },
    },
    {
      name: "calendar-dots-dark",
      input: { design: withCalendar(loadTemplate("calendar-dots"), { theme: "dark" }), data },
    },
  ],
});
