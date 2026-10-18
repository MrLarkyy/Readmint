import { DesignLimits, LocalNames } from "@readmint/format";
import { element } from "./dom.js";
import type { PropertyActions } from "./PropertyActions.js";
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
export function letFieldset(
  form: HTMLElement,
  actions: PropertyActions,
  pointer: string,
  bindings: Readonly<Record<string, string>> | undefined,
): void {
  const entries: LetEntries = Object.entries(bindings ?? {});
  const box = element(form, "fieldset", { className: "rm-fieldset rm-let" });
  element(box, "legend", { text: "Let" });
  const change = (next: LetEntries) => {
    actions.setLet(pointer, next);
  };
  entries.forEach(([name, expression], index) => {
    const shown = name.slice(0, LocalNames.maxLength);
    const row = element(box, "div", { className: "rm-let-row" });
    const nameInput = element(row, "input", {
      attributes: {
        name: "let-name",
        "aria-label": `Let name ${shown}`,
        maxlength: String(LocalNames.maxLength),
      },
    });
    nameInput.value = name;
    nameInput.addEventListener("change", () => {
      change(entries.map((entry, at) => (at === index ? [nameInput.value, entry[1]] : entry)));
    });
    const expressionInput = element(row, "textarea", {
      attributes: {
        name: "let-expression",
        "aria-label": `Let expression ${shown}`,
        maxlength: String(DesignLimits.maxBindingLength),
        rows: "2",
      },
    });
    expressionInput.value = expression;
    expressionInput.addEventListener("change", () => {
      change(
        entries.map((entry, at) => (at === index ? [entry[0], expressionInput.value] : entry)),
      );
    });
    const up = element(row, "button", {
      text: "Move up",
      attributes: { type: "button", "data-action": "let-up", "aria-label": `Move ${shown} up` },
    });
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      const next = [...entries];
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
      change(entries.filter((_, at) => at !== index));
    });
  });
  const atCap = entries.length >= DesignLimits.maxLetEntries;
  const add = element(box, "button", {
    text: "Add binding",
    attributes: { type: "button", "data-action": "add-let" },
  });
  if (atCap) {
    add.disabled = true;
    add.title = `a layer may have at most ${String(DesignLimits.maxLetEntries)} let entries`;
  }
  add.addEventListener("click", () => {
    change([...entries, [freshName(entries.map(([name]) => name)), newLetExpression]]);
  });
}
