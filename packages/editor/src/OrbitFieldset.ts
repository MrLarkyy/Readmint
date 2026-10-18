import type { Orbit } from "@readmint/format";
import { childPointer } from "./designPointer.js";
import { element } from "./dom.js";
import { fieldText, parseField } from "./LayerField.js";
import { newOrbit, orbitFadeKeys, orbitFields } from "./orbitFields.js";
import type { PropertyActions } from "./PropertyActions.js";

const binding = /^\{\{[\s\S]+\}\}$/u;

/** The orbit of a layer: one input per value, "Add orbit" when it has none, "Remove orbit" when it has. */
export function orbitFieldset(
  form: HTMLElement,
  actions: PropertyActions,
  pointer: string,
  orbit: Orbit | undefined,
): void {
  const box = element(form, "fieldset", { className: "rm-fieldset" });
  element(box, "legend", { text: "Orbit" });
  if (orbit === undefined) {
    const add = element(box, "button", {
      text: "Add orbit",
      attributes: { type: "button", "data-action": "add-orbit" },
    });
    add.addEventListener("click", () => {
      actions.set(pointer, "orbit", structuredClone(newOrbit));
    });
    return;
  }
  const orbitPointer = childPointer(pointer, "orbit");
  for (const { label, parent, field } of orbitFields) {
    const holder: unknown = parent === "" ? orbit : orbit[parent];
    const value = (holder as Record<string, unknown>)[field.key];
    const row = element(box, "label", { className: "rm-field" });
    element(row, "span", { text: label });
    const target = parent === "" ? orbitPointer : childPointer(orbitPointer, parent);
    const input = element(row, "input", { attributes: { name: `orbit.${label}` } });
    input.value = fieldText(value);
    if (typeof value === "string" && binding.test(value)) input.classList.add("rm-bound");
    input.addEventListener("change", () => {
      const parsed = parseField(field, input.value);
      if (parsed.ok) actions.set(target, field.key, parsed.value);
      else actions.invalid(`orbit ${parsed.message}`, childPointer(target, field.key));
    });
  }
  const fade = element(box, "div", { className: "rm-fade" });
  const inputs = orbitFadeKeys.map((key) => {
    const row = element(fade, "label", { className: "rm-field" });
    element(row, "span", { text: `fade.${key}` });
    const input = element(row, "input", { attributes: { name: `orbit.fade.${key}` } });
    input.value = fieldText(orbit.fade?.[key]);
    return input;
  });
  const commitFade = () => {
    const texts = inputs.map((input) => input.value.trim());
    if (texts.every((text) => text === "")) {
      actions.set(orbitPointer, "fade", undefined);
      return;
    }
    const values = texts.map((text) =>
      parseField({ key: "fade", kind: "number", required: true }, text),
    );
    const [from, to] = values;
    if (
      from?.ok !== true ||
      to?.ok !== true ||
      typeof from.value !== "number" ||
      typeof to.value !== "number"
    ) {
      actions.invalid(
        "orbit fade needs from and to, both numbers",
        childPointer(orbitPointer, "fade"),
      );
      return;
    }
    actions.set(orbitPointer, "fade", { from: from.value, to: to.value });
  };
  for (const input of inputs) input.addEventListener("change", commitFade);
  const remove = element(box, "button", {
    text: "Remove orbit",
    attributes: { type: "button", "data-action": "remove-orbit" },
  });
  remove.addEventListener("click", () => {
    actions.set(pointer, "orbit", undefined);
  });
}
