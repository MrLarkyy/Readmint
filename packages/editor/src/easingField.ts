import type { Easing } from "@readmint/format";
import { childPointer } from "./designPointer.js";
import { element } from "./dom.js";
import { keyAttributes } from "./ControlKey.js";
import { fieldText, parseField } from "./LayerField.js";
import type { PanelContext } from "./PanelContext.js";

/** Where an easing control sits and how it reads and writes. */
export interface EasingFieldProps {
  /** The input name; the bezier numbers add `.x1` .. `.y2`. */
  readonly name: string;
  /** What the select is for `ControlKey`; the bezier inputs add `-x1` .. `-y2`. */
  readonly kind: string;
  readonly at: readonly number[];
  readonly home: readonly string[];
  /** The pointer of the easing, for an issue about a typed value. */
  readonly path: string;
  /** The easing now, from the newest state. */
  readonly read: () => unknown;
  /** Stores the easing; `undefined` removes it. */
  readonly commit: (easing: Easing | undefined) => void;
}

const keywords = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
const bezierKeys = ["x1", "y1", "x2", "y2"] as const;
const bezier = "cubic-bezier";
const startBezier = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };

/** The shape of an easing for the panel's structure key: unset, a keyword or a bezier. */
export function easingShape(easing: unknown): string {
  return typeof easing === "object" && easing !== null
    ? bezier
    : typeof easing === "string"
      ? "keyword"
      : "";
}

/** A select of the easing keywords with "cubic-bezier", whose four numbers appear while it is chosen. */
export function easingField(
  parent: HTMLElement,
  context: PanelContext,
  props: EasingFieldProps,
): void {
  const { actions } = context;
  const row = element(parent, "label", { className: "rm-field" });
  element(row, "span", { text: "easing" });
  const select = element(row, "select", {
    attributes: {
      name: props.name,
      ...keyAttributes(props.kind, props.at, props.home),
    },
  });
  for (const option of ["", ...keywords, bezier]) {
    const item = element(select, "option", { text: option === "" ? "(inherit)" : option });
    item.value = option;
  }
  const shown = () => {
    const easing = props.read();
    return typeof easing === "object" && easing !== null ? bezier : fieldText(easing);
  };
  context.bind(select, shown);
  select.addEventListener("change", () => {
    const chosen = select.value;
    if (chosen === "") props.commit(undefined);
    else if (chosen === bezier) props.commit({ ...startBezier });
    else props.commit(chosen as Easing);
  });
  if (shown() !== bezier) return;
  const grid = element(parent, "div", { className: "rm-bezier" });
  const inputs = bezierKeys.map((key) => {
    const cell = element(grid, "label", { className: "rm-field" });
    element(cell, "span", { text: key });
    const input = element(cell, "input", {
      attributes: {
        name: `${props.name}.${key}`,
        "aria-label": `${props.name} ${key}`,
        ...keyAttributes(`${props.kind}-${key}`, props.at, props.home),
      },
    });
    context.bind(input, () => {
      const easing = props.read();
      return fieldText(
        typeof easing === "object" && easing !== null
          ? (easing as Record<string, unknown>)[key]
          : undefined,
      );
    });
    return input;
  });
  const commitBezier = () => {
    const values: Record<string, number> = {};
    for (const [index, key] of bezierKeys.entries()) {
      const parsed = parseField(
        { key, kind: "number", required: true },
        inputs[index]?.value ?? "",
      );
      if (!parsed.ok || typeof parsed.value !== "number") {
        actions.invalid(`easing ${key} must be a number`, childPointer(props.path, key));
        return;
      }
      values[key] = parsed.value;
    }
    props.commit(values as unknown as Easing);
  };
  for (const input of inputs) input.addEventListener("change", commitBezier);
}
