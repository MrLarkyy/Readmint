import type { Design, Layer } from "@readmint/format";
import { childPointer, getAt } from "./designPointer.js";
import { controlKey, focusControl, type ControlKey } from "./ControlKey.js";
import { clear, element } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import { findLayer, placedByLayout } from "./layerAccess.js";
import { canvasFields, fieldText, layerFields, parseField, type LayerField } from "./LayerField.js";
import { animateFieldset, presentTracks } from "./animateFieldset.js";
import { easingShape } from "./easingField.js";
import { letFieldset } from "./letFieldset.js";
import { orbitFieldset } from "./orbitFieldset.js";
import { paletteFieldset } from "./paletteFieldset.js";
import type { PanelContext } from "./PanelContext.js";
import type { PropertyActions } from "./PropertyActions.js";
import { timelineFieldset } from "./timelineFieldset.js";

/**
 * The properties of the selected layer, or of the canvas when none is selected. A number field takes a literal or a
 * `{{binding}}`; a change is committed when the field loses focus or Enter is pressed. An edit that keeps the panel's
 * structure (the same fields and as many let rows, palette modes and tokens; a rename keeps it) only refreshes the
 * values and labels, so the focused field stays and Tab moves on from it; otherwise the panel is rebuilt and the
 * focus returns to the control at the same place (`ControlKey`): the next row or the group's Add button after a
 * removal.
 */
export class PropertyPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private shown: readonly unknown[] = [];
  private structure = "";
  private latest: EditorState | undefined;
  private syncs: (() => void)[] = [];
  private followed: ControlKey | undefined;
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
      refresh: (apply) => {
        apply();
        this.syncs.push(apply);
      },
      focusAfter: (kind, at) => {
        this.followed = { kind, at, home: [] };
      },
    };
  }

  update(state: EditorState): void {
    const followed = this.followed;
    this.followed = undefined;
    this.latest = state;
    const pointer = state.selection ?? "/canvas";
    const target = getAt(state.design, pointer);
    const key = [
      pointer,
      target,
      state.design.assets,
      state.design.components,
      state.design.palette,
      state.design.animation,
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
      layer === undefined ? null : [layer.orbit !== undefined, Object.keys(layer.let ?? {}).length],
      layer === undefined ? null : trackShape(layer),
      state.design.animation === undefined,
      layer === undefined ? paletteShape(state.design) : null,
      state.design.palette === undefined,
    ]);
    if (structure === this.structure) {
      for (const sync of this.syncs) sync();
      const active = this.form.ownerDocument.activeElement;
      if (followed !== undefined && active !== null && this.form.contains(active))
        focusControl(this.form, followed);
      return;
    }
    this.structure = structure;
    this.rebuild(state, pointer, layer !== undefined, fields, followed);
  }

  private rebuild(
    state: EditorState,
    pointer: string,
    isLayer: boolean,
    fields: readonly LayerField[],
    followed: ControlKey | undefined,
  ): void {
    const active = this.form.ownerDocument.activeElement;
    const focused = active !== null && this.form.contains(active) ? controlKey(active) : undefined;
    const kept = focused === undefined ? undefined : (followed ?? focused);
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
      timelineFieldset(this.form, this.context);
      paletteFieldset(this.form, this.context);
    } else {
      orbitFieldset(this.form, this.context, pointer);
      letFieldset(this.form, this.context, pointer);
      animateFieldset(this.form, this.context, pointer);
    }
    if (kept !== undefined) focusControl(this.form, kept);
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

/** The tracks a layer has with their keyframe counts and easing shapes: a change of any of them rebuilds the rows. */
function trackShape(layer: Layer): unknown[] {
  const animate = layer.animate as Record<string, Track | undefined> | undefined;
  return presentTracks(layer).map(({ property }) => {
    const track = animate?.[property];
    return [
      property,
      track?.keyframes.length ?? 0,
      easingShape(track?.easing),
      track?.keyframes.map((frame) => easingShape(frame.easing)).join(","),
    ];
  });
}

interface Track {
  readonly keyframes: readonly { readonly easing?: unknown }[];
  readonly easing?: unknown;
}

/** How many modes and tokens the palette has: a rename keeps the shape, so the panel keeps its elements. */
function paletteShape(design: Design): [number, number] {
  const modes = Object.values(design.palette ?? {});
  return [modes.length, Object.keys(modes[0] ?? {}).length];
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
