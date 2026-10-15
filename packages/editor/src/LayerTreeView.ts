import { clear, element } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import { layerTree } from "./layerTree.js";

/** What the layer tree asks the editor to do. */
export interface LayerTreeActions {
  select(pointer: string): void;
  reorder(pointer: string, index: number): void;
  remove(pointer: string): void;
}

/** The layers as an indented list in drawing order (later rows are drawn over earlier ones). */
export class LayerTreeView {
  readonly root: HTMLElement;
  private readonly list: HTMLUListElement;
  private shown: unknown;

  constructor(
    parent: Element,
    private readonly actions: LayerTreeActions,
  ) {
    this.root = element(parent, "section", { className: "rm-layers" });
    element(this.root, "h2", { text: "Layers" });
    this.list = element(this.root, "ul", { attributes: { "aria-label": "Layers" } });
  }

  update(state: EditorState): void {
    const key = [state.design.layers, state.selection];
    if (this.shown !== undefined && sameKey(this.shown, key)) return;
    this.shown = key;
    clear(this.list);
    for (const row of layerTree(state.design)) {
      const item = element(this.list, "li", {
        attributes: { "data-pointer": row.pointer },
        style: { paddingLeft: `${String(row.depth)}em` },
      });
      const selected = row.pointer === state.selection;
      const label = element(item, "button", {
        className: selected ? "rm-layer rm-selected" : "rm-layer",
        text: `${row.label} (${row.type})`,
        attributes: { type: "button", "aria-pressed": String(selected), "data-action": "select" },
      });
      label.addEventListener("click", () => {
        this.actions.select(row.pointer);
      });
      this.button(item, "↓", "Move back", row.index > 0, () => {
        this.actions.reorder(row.pointer, row.index - 1);
      });
      this.button(item, "↑", "Move forward", row.index < row.siblings - 1, () => {
        this.actions.reorder(row.pointer, row.index + 1);
      });
      this.button(item, "×", "Remove", true, () => {
        this.actions.remove(row.pointer);
      });
    }
  }

  private button(
    item: Element,
    text: string,
    label: string,
    enabled: boolean,
    run: () => void,
  ): void {
    const button = element(item, "button", {
      text,
      attributes: {
        type: "button",
        "aria-label": label,
        "data-action": label.toLowerCase().replace(" ", "-"),
      },
    });
    button.disabled = !enabled;
    button.addEventListener("click", run);
  }
}

function sameKey(a: unknown, b: readonly unknown[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index]);
}
