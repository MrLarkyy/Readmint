import { keyAttributes } from "./ControlKey.js";
import { element } from "./dom.js";
import { fieldText, parseField } from "./LayerField.js";
import type { PanelContext } from "./PanelContext.js";

/** The default timeline "Add timeline" creates. */
export const newTimeline = Object.freeze({ duration: 3000, loop: true });

/** The design's timeline on the canvas: "Add timeline" when it has none, else its duration, loop and "Remove timeline". */
export function timelineFieldset(form: HTMLElement, context: PanelContext): void {
  const { actions } = context;
  const now = () => context.latest().design.animation;
  const box = element(form, "fieldset", { className: "rm-fieldset rm-timeline" });
  element(box, "legend", { text: "Timeline" });
  if (now() === undefined) {
    const add = element(box, "button", {
      text: "Add timeline",
      attributes: { type: "button", "data-action": "add-timeline" },
    });
    add.addEventListener("click", () => {
      actions.setTimeline({ ...newTimeline });
    });
    return;
  }
  const durationRow = element(box, "label", { className: "rm-field" });
  element(durationRow, "span", { text: "duration (ms)" });
  const duration = element(durationRow, "input", {
    attributes: {
      name: "timeline.duration",
      ...keyAttributes("timeline-duration", [], ["add-timeline"]),
    },
  });
  context.bind(duration, () => fieldText(now()?.duration));
  duration.addEventListener("change", () => {
    const parsed = parseField({ key: "duration", kind: "number", required: true }, duration.value);
    if (!parsed.ok || typeof parsed.value !== "number") {
      actions.invalid("timeline duration must be a number", "/animation/duration");
      return;
    }
    const current = now();
    actions.setTimeline({ ...current, duration: parsed.value });
  });
  const loopRow = element(box, "label", { className: "rm-field" });
  element(loopRow, "span", { text: "loop" });
  const loop = element(loopRow, "input", {
    attributes: { type: "checkbox", name: "timeline.loop" },
  });
  context.refresh(() => {
    loop.checked = now()?.loop !== false;
  });
  loop.addEventListener("change", () => {
    actions.setTimeline({ ...now(), loop: loop.checked });
  });
  const remove = element(box, "button", {
    text: "Remove timeline",
    attributes: { type: "button", "data-action": "remove-timeline", "data-home": "add-timeline" },
  });
  remove.addEventListener("click", () => {
    actions.setTimeline(undefined);
  });
}
