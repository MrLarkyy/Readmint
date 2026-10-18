import { DesignLimits } from "@readmint/format";
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
import type { PanelContext } from "./PanelContext.js";

const shownName = 64;

/**
 * The design's palette as a grid: a row per token, a column per mode, a text input and a colour picker per cell.
 * Every operation replaces the palette whole through `setPalette`, so the modes keep the same tokens and an edit is
 * one undo step.
 */
export function paletteFieldset(form: HTMLElement, context: PanelContext): void {
  const { actions } = context;
  const entriesNow = () => paletteEntries(context.latest().design.palette);
  const colourNow = (mode: string, token: string) =>
    entriesNow()
      .find(([name]) => name === mode)?.[1]
      .find(([name]) => name === token)?.[1] ?? "";
  const box = element(form, "fieldset", { className: "rm-fieldset rm-palette" });
  element(box, "legend", { text: "Palette" });
  const entries = entriesNow();
  if (context.latest().design.palette === undefined) {
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
      actions.setPalette(renameMode(entriesNow(), mode, input.value));
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
      actions.setPalette(removeMode(entriesNow(), mode));
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
      actions.setPalette(renameToken(entriesNow(), token, name.value));
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
      actions.setPalette(removeToken(entriesNow(), token));
    });
    for (const [mode] of entries) {
      const label = `${token.slice(0, shownName)} in ${mode.slice(0, shownName)}`;
      const cell = element(tr, "td");
      const text = element(cell, "input", {
        attributes: { name: "colour", "aria-label": label },
      });
      context.bind(text, () => colourNow(mode, token));
      text.addEventListener("change", () => {
        actions.setPalette(setColour(entriesNow(), mode, token, text.value));
      });
      const picker = element(cell, "input", {
        className: "rm-picker",
        attributes: { type: "color", "aria-label": `Pick ${label}` },
      });
      context.bind(picker, () => pickerValue(colourNow(mode, token)));
      picker.addEventListener("change", () => {
        actions.setPalette(
          setColour(entriesNow(), mode, token, withPicked(colourNow(mode, token), picker.value)),
        );
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
    actions.setPalette(addMode(entriesNow()));
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
    actions.setPalette(addToken(entriesNow()));
  });
}
