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
 * The design's palette: the modes (a name input and Remove each), then a group per token with its name input and
 * Remove and one row per mode (mode label, colour text, colour picker). Every operation replaces the palette whole
 * through `setPalette`, so the modes keep the same tokens and an edit is one undo step.
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
  const modesBox = element(box, "div", { className: "rm-palette-modes" });
  for (const [mode] of entries) {
    const row = element(modesBox, "div", { className: "rm-palette-row" });
    const input = element(row, "input", {
      attributes: { name: "mode-name", "aria-label": `Mode ${mode.slice(0, shownName)}` },
    });
    input.value = mode;
    input.addEventListener("change", () => {
      actions.setPalette(renameMode(entriesNow(), mode, input.value));
    });
    const remove = element(row, "button", {
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
  const tokens = entries[0]?.[1] ?? [];
  for (const [token] of tokens) {
    const group = element(box, "div", { className: "rm-palette-token" });
    const head = element(group, "div", { className: "rm-palette-row" });
    const name = element(head, "input", {
      attributes: { name: "token-name", "aria-label": `Token ${token.slice(0, shownName)}` },
    });
    name.value = token;
    name.addEventListener("change", () => {
      actions.setPalette(renameToken(entriesNow(), token, name.value));
    });
    const remove = element(head, "button", {
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
      const row = element(group, "div", { className: "rm-palette-cell" });
      element(row, "span", { className: "rm-palette-mode", text: mode });
      const text = element(row, "input", { attributes: { name: "colour", "aria-label": label } });
      context.bind(text, () => colourNow(mode, token));
      text.addEventListener("change", () => {
        actions.setPalette(setColour(entriesNow(), mode, token, text.value));
      });
      const picker = element(row, "input", {
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
  const addModeButton = element(box, "button", {
    text: "Add mode",
    attributes: { type: "button", "data-action": "add-mode" },
  });
  if (entries.length >= DesignLimits.maxPaletteModes) {
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
  if (tokens.length >= DesignLimits.maxPaletteTokens) {
    addTokenButton.disabled = true;
    addTokenButton.title = `a palette mode may have at most ${String(DesignLimits.maxPaletteTokens)} tokens`;
  }
  addTokenButton.addEventListener("click", () => {
    actions.setPalette(addToken(entriesNow()));
  });
}
