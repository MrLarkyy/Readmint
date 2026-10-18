import { DesignLimits, LocalNames } from "@readmint/format";
import { element } from "./dom.js";
import { findLayer } from "./layerAccess.js";
import type { PanelContext } from "./PanelContext.js";
import type { LetEntries } from "./setLayerLet.js";

/** A new binding's expression: valid, and harmless until edited. */
export const newLetExpression = "{{ null }}";

function freshName(taken: readonly string[]): string {
  for (let index = 1; ; index++) {
    const name = `local${String(index)}`;
    if (!taken.includes(name)) return name;
  }
}

/** The `let` of a layer: a row per binding (name, expression, Move up, Remove) and "Add binding". */
export function letFieldset(form: HTMLElement, context: PanelContext, pointer: string): void {
  const entriesNow = (): LetEntries =>
    Object.entries(findLayer(context.latest().design, pointer)?.let ?? {});
  const entries = entriesNow();
  const box = element(form, "fieldset", { className: "rm-fieldset rm-let" });
  element(box, "legend", { text: "Let" });
  const change = (next: LetEntries) => {
    context.actions.setLet(pointer, next);
  };
  entries.forEach(([name], index) => {
    const shown = name.slice(0, LocalNames.maxLength);
    const row = element(box, "div", { className: "rm-let-row" });
    const nameInput = element(row, "input", {
      attributes: {
        name: "let-name",
        "aria-label": `Let name ${shown}`,
        maxlength: String(LocalNames.maxLength),
      },
    });
    context.bind(nameInput, () => entriesNow()[index]?.[0] ?? "");
    nameInput.addEventListener("change", () => {
      change(entriesNow().map((entry, at) => (at === index ? [nameInput.value, entry[1]] : entry)));
    });
    const expressionInput = element(row, "textarea", {
      attributes: {
        name: "let-expression",
        "aria-label": `Let expression ${shown}`,
        maxlength: String(DesignLimits.maxBindingLength),
        rows: "2",
      },
    });
    context.bind(expressionInput, () => entriesNow()[index]?.[1] ?? "");
    expressionInput.addEventListener("change", () => {
      change(
        entriesNow().map((entry, at) => (at === index ? [entry[0], expressionInput.value] : entry)),
      );
    });
    const up = element(row, "button", {
      text: "Move up",
      attributes: { type: "button", "data-action": "let-up", "aria-label": `Move ${shown} up` },
    });
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      const next = [...entriesNow()];
      const [moved] = next.splice(index, 1);
      if (moved !== undefined) next.splice(index - 1, 0, moved);
      change(next);
    });
    const remove = element(row, "button", {
      text: "Remove",
      attributes: {
        type: "button",
        "data-action": "let-remove",
        "aria-label": `Remove ${shown}`,
      },
    });
    remove.addEventListener("click", () => {
      change(entriesNow().filter((_, at) => at !== index));
    });
  });
  const add = element(box, "button", {
    text: "Add binding",
    attributes: { type: "button", "data-action": "add-let" },
  });
  if (entries.length >= DesignLimits.maxLetEntries) {
    add.disabled = true;
    add.title = `a layer may have at most ${String(DesignLimits.maxLetEntries)} let entries`;
  }
  add.addEventListener("click", () => {
    const now = entriesNow();
    change([...now, [freshName(now.map(([name]) => name)), newLetExpression]]);
  });
}
