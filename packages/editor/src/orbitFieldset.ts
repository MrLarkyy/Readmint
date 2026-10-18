import { childPointer } from "./designPointer.js";
import { element } from "./dom.js";
import { findLayer } from "./layerAccess.js";
import { fieldText, parseField } from "./LayerField.js";
import { newOrbit, orbitFadeKeys, orbitFields } from "./orbitFields.js";
import type { PanelContext } from "./PanelContext.js";
import { sameJson } from "./sameJson.js";

const binding = /^\{\{[\s\S]+\}\}$/u;

/** The orbit of a layer: one input per value, "Add orbit" when it has none, "Remove orbit" when it has. */
export function orbitFieldset(form: HTMLElement, context: PanelContext, pointer: string): void {
  const { actions } = context;
  const orbitNow = () => findLayer(context.latest().design, pointer)?.orbit;
  const box = element(form, "fieldset", { className: "rm-fieldset" });
  element(box, "legend", { text: "Orbit" });
  if (orbitNow() === undefined) {
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
    const valueNow = () => {
      const orbit = orbitNow();
      const holder: unknown = parent === "" ? orbit : orbit?.[parent];
      return (holder as Record<string, unknown> | undefined)?.[field.key];
    };
    const row = element(box, "label", { className: "rm-field" });
    element(row, "span", { text: label });
    const target = parent === "" ? orbitPointer : childPointer(orbitPointer, parent);
    const input = element(row, "input", { attributes: { name: `orbit.${label}` } });
    context.bind(input, () => {
      const value = valueNow();
      input.classList.toggle("rm-bound", typeof value === "string" && binding.test(value));
      return fieldText(value);
    });
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
    context.bind(input, () => fieldText(orbitNow()?.fade?.[key]));
    return input;
  });
  const commitFade = () => {
    const texts = inputs.map((input) => input.value.trim());
    const current = orbitNow()?.fade;
    if (texts.every((text) => text === "")) {
      if (current !== undefined) actions.set(orbitPointer, "fade", undefined);
      return;
    }
    const [from, to] = texts.map((text) =>
      parseField({ key: "fade", kind: "number", required: true }, text),
    );
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
    const next = { from: from.value, to: to.value };
    if (!sameJson(next, current)) actions.set(orbitPointer, "fade", next);
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
