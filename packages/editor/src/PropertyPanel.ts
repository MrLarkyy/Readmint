import type { Design } from "@readmint/format";
import { childPointer, getAt } from "./designPointer.js";
import { clear, element } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import { findLayer, placedByLayout } from "./layerAccess.js";
import { canvasFields, fieldText, layerFields, parseField, type LayerField } from "./LayerField.js";
import { letFieldset } from "./letFieldset.js";
import { orbitFieldset } from "./orbitFieldset.js";
import { paletteFieldset } from "./paletteFieldset.js";
import type { PanelContext } from "./PanelContext.js";
import type { PropertyActions } from "./PropertyActions.js";

const controls = "input, select, textarea, button";

/**
 * The properties of the selected layer, or of the canvas when none is selected. A number field takes a literal or a
 * `{{binding}}`; a change is committed when the field loses focus or Enter is pressed. An edit that keeps the panel's
 * structure (the same fields, let names, palette modes and tokens) only refreshes the values, so the focused field
 * stays; otherwise the panel is rebuilt and the focus returns to the same control (by name, action and label), or to
 * nothing when that control is gone.
 */
export class PropertyPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private shown: readonly unknown[] = [];
  private structure = "";
  private latest: EditorState | undefined;
  private syncs: (() => void)[] = [];
  private readonly context: PanelContext;

  constructor(
    parent: Element,
    private readonly actions: PropertyActions,
  ) {
    this.root = element(parent, "section", { className: "rm-properties" });
    this.form = element(this.root, "form", { attributes: { "aria-label": "Properties" } });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    this.context = {
      actions,
      latest: () => {
        if (this.latest === undefined) throw new Error("the property panel has no state yet");
        return this.latest;
      },
      bind: (input, read) => {
        let typed = false;
        input.addEventListener("input", () => {
          typed = true;
        });
        input.addEventListener("change", () => {
          typed = false;
        });
        const apply = () => {
          if (!(typed && input.ownerDocument.activeElement === input)) input.value = read();
        };
        input.value = read();
        this.syncs.push(apply);
      },
    };
  }

  update(state: EditorState): void {
    this.latest = state;
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
    const layer =
      state.selection === undefined ? undefined : findLayer(state.design, state.selection);
    const fields = layer === undefined ? canvasFields : layerFields(layer, sources(state.design));
    const structure = JSON.stringify([
      pointer,
      layer?.type,
      placedByLayout(state.design, pointer),
      fields.map((field) => [field.key, field.kind, field.options, choiceExtra(field, target)]),
      layer === undefined ? null : [layer.orbit !== undefined, Object.keys(layer.let ?? {})],
      layer === undefined
        ? Object.entries(state.design.palette ?? {}).map(([mode, tokens]) => [
            mode,
            Object.keys(tokens),
          ])
        : null,
      state.design.palette === undefined,
    ]);
    if (structure === this.structure) {
      for (const sync of this.syncs) sync();
      return;
    }
    this.structure = structure;
    this.rebuild(state, pointer, layer !== undefined, fields);
  }

  private rebuild(
    state: EditorState,
    pointer: string,
    isLayer: boolean,
    fields: readonly LayerField[],
  ): void {
    const active = this.form.ownerDocument.activeElement;
    const kept = active !== null && this.form.contains(active) ? identity(active) : undefined;
    clear(this.form);
    this.syncs = [];
    const layer = isLayer ? findLayer(state.design, pointer) : undefined;
    element(this.form, "h2", { text: layer === undefined ? "Canvas" : `${layer.type} layer` });
    if (layer !== undefined && placedByLayout(state.design, pointer)) {
      element(this.form, "p", {
        className: "rm-note",
        text: "Placed by the layout of its group: x and y are offsets in its slot; it cannot be dragged.",
      });
    }
    for (const field of fields) this.field(pointer, field);
    if (layer === undefined) {
      paletteFieldset(this.form, this.context);
    } else {
      orbitFieldset(this.form, this.context, pointer);
      letFieldset(this.form, this.context, pointer);
    }
    if (kept !== undefined) {
      const same = [...this.form.querySelectorAll<HTMLElement>(controls)].filter(
        (control) => identity(control) === kept,
      );
      if (same.length === 1) same[0]?.focus();
    }
  }

  private field(pointer: string, field: LayerField): void {
    const valueNow = () => {
      const state = this.context.latest();
      return getAt(getAt(state.design, pointer), childPointer("", field.key));
    };
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
      const current = fieldText(valueNow());
      if (!options.includes(current)) options.push(current);
      for (const option of options) {
        const item = element(select, "option", { text: option === "" ? "(none)" : option });
        item.value = option;
      }
      this.context.bind(select, () => fieldText(valueNow()));
      select.addEventListener("change", () => {
        commit(select.value);
      });
      return;
    }
    const input = element(label, field.key === "content" ? "textarea" : "input", {
      attributes: { name: field.key },
    });
    this.context.bind(input, () => {
      const value = valueNow();
      input.classList.toggle(
        "rm-bound",
        typeof value === "string" && /^\{\{[\s\S]+\}\}$/u.test(value),
      );
      return fieldText(value);
    });
    input.addEventListener("change", () => {
      commit(input.value);
    });
  }
}

/** What names a control across a rebuild: its kind, name, action and label; never its position. */
function identity(control: Element): string {
  return [
    control.tagName,
    control.getAttribute("name"),
    control.getAttribute("data-action"),
    control.getAttribute("aria-label"),
  ].join("|");
}

/** A choice's current value when it is not among the options: it is then an extra option of the select. */
function choiceExtra(field: LayerField, target: unknown): string | undefined {
  if (field.kind !== "choice") return undefined;
  const current = fieldText(getAt(target, childPointer("", field.key)));
  const options = [...(field.required === true ? [] : [""]), ...(field.options ?? [])];
  return options.includes(current) ? undefined : current;
}

function sources(design: Design) {
  return {
    fonts: Object.keys(design.assets?.fonts ?? {}),
    images: Object.keys(design.assets?.images ?? {}),
    components: Object.keys(design.components ?? {}),
  };
}
