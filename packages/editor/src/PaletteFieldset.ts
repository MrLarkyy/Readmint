import { DesignLimits, type Palette } from "@readmint/format";
import { element } from "./dom.js";
import {
  addMode,
  addToken,
  paletteEntries,
  removeMode,
  removeToken,
  renameMode,
  renameToken,
  setColour,
} from "./paletteEdits.js";
import { pickerValue, withPicked } from "./pickerColour.js";
import type { PropertyActions } from "./PropertyActions.js";

const shownName = 64;

/**
 * The design's palette as a grid: a row per token, a column per mode, a text input and a colour picker per cell.
 * Every operation replaces the palette whole through `setPalette`, so the modes keep the same tokens and an edit is
 * one undo step.
 */
export function paletteFieldset(
  form: HTMLElement,
  actions: PropertyActions,
  palette: Palette | undefined,
): void {
  const box = element(form, "fieldset", { className: "rm-fieldset rm-palette" });
  element(box, "legend", { text: "Palette" });
  const entries = paletteEntries(palette);
  if (palette === undefined) {
    const add = element(box, "button", {
      text: "Add palette",
      attributes: { type: "button", "data-action": "add-palette" },
    });
    add.addEventListener("click", () => {
      actions.setPalette([["light", []]]);
    });
    return;
  }
  const scroll = element(box, "div", { className: "rm-palette-scroll" });
  const table = element(scroll, "table", { attributes: { "aria-label": "Palette" } });
  const head = element(element(table, "thead"), "tr");
  element(head, "th", { text: "token" });
  for (const [mode] of entries) {
    const cell = element(head, "th");
    const input = element(cell, "input", {
      attributes: { name: "mode-name", "aria-label": `Mode ${mode.slice(0, shownName)}` },
    });
    input.value = mode;
    input.addEventListener("change", () => {
      actions.setPalette(renameMode(entries, mode, input.value));
    });
    const remove = element(cell, "button", {
      text: "Remove",
      attributes: {
        type: "button",
        "data-action": "remove-mode",
        "aria-label": `Remove mode ${mode.slice(0, shownName)}`,
      },
    });
    remove.addEventListener("click", () => {
      actions.setPalette(removeMode(entries, mode));
    });
  }
  const body = element(table, "tbody");
  const tokens = entries[0]?.[1] ?? [];
  for (const [token] of tokens) {
    const tr = element(body, "tr");
    const nameCell = element(tr, "th");
    const name = element(nameCell, "input", {
      attributes: { name: "token-name", "aria-label": `Token ${token.slice(0, shownName)}` },
    });
    name.value = token;
    name.addEventListener("change", () => {
      actions.setPalette(renameToken(entries, token, name.value));
    });
    const remove = element(nameCell, "button", {
      text: "Remove",
      attributes: {
        type: "button",
        "data-action": "remove-token",
        "aria-label": `Remove token ${token.slice(0, shownName)}`,
      },
    });
    remove.addEventListener("click", () => {
      actions.setPalette(removeToken(entries, token));
    });
    for (const [mode, modeTokens] of entries) {
      const colour = modeTokens.find(([name]) => name === token)?.[1] ?? "";
      const label = `${token.slice(0, shownName)} in ${mode.slice(0, shownName)}`;
      const cell = element(tr, "td");
      const text = element(cell, "input", {
        attributes: { name: "colour", "aria-label": label },
      });
      text.value = colour;
      text.addEventListener("change", () => {
        actions.setPalette(setColour(entries, mode, token, text.value));
      });
      const picker = element(cell, "input", {
        className: "rm-picker",
        attributes: { type: "color", "aria-label": `Pick ${label}` },
      });
      picker.value = pickerValue(colour);
      picker.addEventListener("change", () => {
        actions.setPalette(setColour(entries, mode, token, withPicked(colour, picker.value)));
      });
    }
  }
  const modeCap = entries.length >= DesignLimits.maxPaletteModes;
  const tokenCap = tokens.length >= DesignLimits.maxPaletteTokens;
  const addModeButton = element(box, "button", {
    text: "Add mode",
    attributes: { type: "button", "data-action": "add-mode" },
  });
  if (modeCap) {
    addModeButton.disabled = true;
    addModeButton.title = `a palette may have at most ${String(DesignLimits.maxPaletteModes)} modes`;
  }
  addModeButton.addEventListener("click", () => {
    actions.setPalette(addMode(entries));
  });
  const addTokenButton = element(box, "button", {
    text: "Add token",
    attributes: { type: "button", "data-action": "add-token" },
  });
  if (tokenCap) {
    addTokenButton.disabled = true;
    addTokenButton.title = `a palette mode may have at most ${String(DesignLimits.maxPaletteTokens)} tokens`;
  }
  addTokenButton.addEventListener("click", () => {
    actions.setPalette(addToken(entries));
  });
}
