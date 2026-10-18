import { DesignLimits } from "@readmint/format";
import { keyAttributes } from "./ControlKey.js";
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
      attributes: { type: "button", "data-action": "add-palette", "data-home": "add-token" },
    });
    add.addEventListener("click", () => {
      actions.setPalette([["light", []]]);
    });
    return;
  }
  const modeNow = (modeAt: number) => entriesNow()[modeAt]?.[0] ?? "";
  const tokenNow = (tokenAt: number) => entriesNow()[0]?.[1][tokenAt]?.[0] ?? "";
  const shown = (name: string) => name.slice(0, shownName);
  const modesBox = element(box, "div", { className: "rm-palette-modes" });
  const modeHome = ["add-mode", "add-palette"];
  entries.forEach((_, modeAt) => {
    const row = element(modesBox, "div", { className: "rm-palette-row" });
    const input = element(row, "input", {
      attributes: { ...keyAttributes("mode-name", [modeAt], modeHome), name: "mode-name" },
    });
    context.bind(input, () => modeNow(modeAt));
    input.addEventListener("change", () => {
      actions.setPalette(renameMode(entriesNow(), modeNow(modeAt), input.value));
    });
    const remove = element(row, "button", {
      text: "Remove",
      attributes: {
        ...keyAttributes("remove-mode", [modeAt], modeHome),
        type: "button",
        "data-action": "remove-mode",
      },
    });
    remove.addEventListener("click", () => {
      actions.setPalette(removeMode(entriesNow(), modeNow(modeAt)));
    });
    context.refresh(() => {
      input.setAttribute("aria-label", `Mode ${shown(modeNow(modeAt))}`);
      remove.setAttribute("aria-label", `Remove mode ${shown(modeNow(modeAt))}`);
    });
  });
  const tokens = entries[0]?.[1] ?? [];
  const tokenHome = ["add-token"];
  tokens.forEach((_, tokenAt) => {
    const group = element(box, "div", { className: "rm-palette-token" });
    const head = element(group, "div", { className: "rm-palette-row" });
    const name = element(head, "input", {
      attributes: { ...keyAttributes("token-name", [tokenAt], tokenHome), name: "token-name" },
    });
    context.bind(name, () => tokenNow(tokenAt));
    name.addEventListener("change", () => {
      actions.setPalette(renameToken(entriesNow(), tokenNow(tokenAt), name.value));
    });
    const remove = element(head, "button", {
      text: "Remove",
      attributes: {
        ...keyAttributes("remove-token", [tokenAt], tokenHome),
        type: "button",
        "data-action": "remove-token",
      },
    });
    remove.addEventListener("click", () => {
      actions.setPalette(removeToken(entriesNow(), tokenNow(tokenAt)));
    });
    context.refresh(() => {
      name.setAttribute("aria-label", `Token ${shown(tokenNow(tokenAt))}`);
      remove.setAttribute("aria-label", `Remove token ${shown(tokenNow(tokenAt))}`);
    });
    entries.forEach((_, modeAt) => {
      const colour = () => colourNow(modeNow(modeAt), tokenNow(tokenAt));
      const row = element(group, "div", { className: "rm-palette-cell" });
      const modeLabel = element(row, "span", { className: "rm-palette-cell-mode" });
      const text = element(row, "input", {
        attributes: { ...keyAttributes("colour", [tokenAt, modeAt], tokenHome), name: "colour" },
      });
      context.bind(text, colour);
      text.addEventListener("change", () => {
        actions.setPalette(setColour(entriesNow(), modeNow(modeAt), tokenNow(tokenAt), text.value));
      });
      const picker = element(row, "input", {
        className: "rm-picker",
        attributes: { ...keyAttributes("picker", [tokenAt, modeAt], tokenHome), type: "color" },
      });
      context.bind(picker, () => pickerValue(colour()));
      picker.addEventListener("change", () => {
        actions.setPalette(
          setColour(
            entriesNow(),
            modeNow(modeAt),
            tokenNow(tokenAt),
            withPicked(colour(), picker.value),
          ),
        );
      });
      context.refresh(() => {
        const mode = modeNow(modeAt);
        const label = `${shown(tokenNow(tokenAt))} in ${shown(mode)}`;
        modeLabel.textContent = mode;
        modeLabel.title = mode;
        text.setAttribute("aria-label", label);
        picker.setAttribute("aria-label", `Pick ${label}`);
      });
    });
  });
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
