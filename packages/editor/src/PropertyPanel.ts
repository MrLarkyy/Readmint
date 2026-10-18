import type { Design } from "@readmint/format";
import { childPointer, getAt } from "./designPointer.js";
import { clear, element } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import { findLayer, placedByLayout } from "./layerAccess.js";
import { letFieldset } from "./LetFieldset.js";
import { orbitFieldset } from "./OrbitFieldset.js";
import { paletteFieldset } from "./PaletteFieldset.js";
import type { PropertyActions } from "./PropertyActions.js";
import { canvasFields, fieldText, layerFields, parseField, type LayerField } from "./LayerField.js";

/**
 * The properties of the selected layer, or of the canvas when none is selected. A number field takes a literal or a
 * `{{binding}}`; a change is committed when the field loses focus or Enter is pressed.
 */
export class PropertyPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private shown: readonly unknown[] = [];

  constructor(
    parent: Element,
    private readonly actions: PropertyActions,
  ) {
    this.root = element(parent, "section", { className: "rm-properties" });
    this.form = element(this.root, "form", { attributes: { "aria-label": "Properties" } });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }

  update(state: EditorState): void {
    const pointer = state.selection ?? "/canvas";
    const target = getAt(state.design, pointer);
    const key = [
      pointer,
      target,
      state.design.assets,
      state.design.components,
      state.design.palette,
    ];
    if (key.every((item, index) => item === this.shown[index])) return;
    this.shown = key;
    clear(this.form);
    const layer =
      state.selection === undefined ? undefined : findLayer(state.design, state.selection);
    element(this.form, "h2", { text: layer === undefined ? "Canvas" : `${layer.type} layer` });
    if (layer !== undefined && placedByLayout(state.design, pointer)) {
      element(this.form, "p", {
        className: "rm-note",
        text: "Placed by the layout of its group: x and y are offsets in its slot; it cannot be dragged.",
      });
    }
    const fields = layer === undefined ? canvasFields : layerFields(layer, sources(state.design));
    for (const field of fields) this.field(pointer, target, field);
    if (layer === undefined) {
      paletteFieldset(this.form, this.actions, state.design.palette);
    } else {
      orbitFieldset(this.form, this.actions, pointer, layer.orbit);
      letFieldset(this.form, this.actions, pointer, layer.let);
    }
  }

  private field(pointer: string, target: unknown, field: LayerField): void {
    const value = getAt(target, childPointer("", field.key));
    const label = element(this.form, "label", { className: "rm-field" });
    element(label, "span", { text: field.key });
    const path = childPointer(pointer, field.key);
    const commit = (text: string) => {
      const parsed = parseField(field, text);
      if (parsed.ok) this.actions.set(pointer, field.key, parsed.value);
      else this.actions.invalid(parsed.message, path);
    };
    if (field.kind === "choice") {
      const select = element(label, "select", { attributes: { name: field.key } });
      const options = [...(field.required === true ? [] : [""]), ...(field.options ?? [])];
      const current = fieldText(value);
      if (!options.includes(current)) options.push(current);
      for (const option of options) {
        const item = element(select, "option", { text: option === "" ? "(none)" : option });
        item.value = option;
      }
      select.value = current;
      select.addEventListener("change", () => {
        commit(select.value);
      });
      return;
    }
    const input = element(label, field.key === "content" ? "textarea" : "input", {
      attributes: { name: field.key },
    });
    input.value = fieldText(value);
    if (typeof value === "string" && /^\{\{[\s\S]+\}\}$/u.test(value)) {
      input.classList.add("rm-bound");
    }
    input.addEventListener("change", () => {
      commit(input.value);
    });
  }
}

function sources(design: Design) {
  return {
    fonts: Object.keys(design.assets?.fonts ?? {}),
    images: Object.keys(design.assets?.images ?? {}),
    components: Object.keys(design.components ?? {}),
  };
}
