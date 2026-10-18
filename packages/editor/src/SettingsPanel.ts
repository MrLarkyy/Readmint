import type { ComponentPropScalar, ComponentPropValue } from "@readmint/format";
import { clear, element } from "./dom.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorSettings } from "./EditorSettings.js";
import type { EditorState } from "./EditorState.js";
import { fieldText, parseField } from "./LayerField.js";
import { settingsFields, type SettingsField } from "./settingsFields.js";

/** What the settings form asks the editor to do. */
export interface SettingsActions {
  /** Sets a prop of the chosen section, or removes it (`undefined`). */
  set(prop: string, value: ComponentPropValue | undefined): void;
  /** Text that is not a valid value for the prop. */
  invalid(message: string): void;
}

type Sync = (next: SettingsField) => void;

/**
 * The props of the chosen settings section as a form: one field per prop the design declares, shown with the
 * section's value, else the chosen variant's, the layer's own or the design's default (written only once edited). A change is committed when the field
 * changes or Enter is pressed. Props the design does not declare are listed to remove. Hidden without a section.
 */
export class SettingsPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private shown: readonly unknown[] = [];
  private structure: string | undefined;
  private syncs: Sync[] = [];

  constructor(
    parent: Element,
    private readonly actions: SettingsActions,
  ) {
    this.root = element(parent, "section", { className: "rm-settings" });
    this.form = element(this.root, "form", { attributes: { "aria-label": "Settings" } });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    this.root.hidden = true;
  }

  update(state: EditorState): void {
    const key = [state.settings, state.design, state.variant, state.manifest];
    if (key.every((item, index) => item === this.shown[index])) return;
    this.shown = key;
    const settings = state.settings;
    this.root.hidden = settings?.section === undefined;
    if (settings?.section === undefined) {
      this.structure = undefined;
      clear(this.form);
      return;
    }
    const { fields, unknown, truncated } = settingsFields(state);
    const structure = JSON.stringify([
      settings.section,
      fields.map((field) => [field.name, field.definition.type, listLength(field)]),
      unknown,
      truncated,
    ]);
    if (structure === this.structure) {
      // Same form: only the values change, so the field being typed in keeps its focus.
      fields.forEach((field, index) => this.syncs[index]?.(field));
      return;
    }
    this.structure = structure;
    this.build(settings, fields, unknown, truncated);
  }

  private build(
    settings: EditorSettings,
    fields: readonly SettingsField[],
    unknown: readonly string[],
    truncated: boolean,
  ): void {
    clear(this.form);
    element(this.form, "h2", { text: settings.section ?? "" });
    this.syncs = fields.map((field) => this.field(field));
    fields.forEach((field, index) => this.syncs[index]?.(field));
    if (unknown.length === 0) return;
    element(this.form, "h3", { text: "Props the design does not declare" });
    for (const name of unknown) {
      const row = element(this.form, "div", {
        className: "rm-field rm-unknown",
        attributes: { "data-prop": name },
      });
      element(row, "span", { text: name });
      this.small(row, "Remove", `Remove ${name}`, () => {
        this.actions.set(name, undefined);
      });
    }
    if (truncated) element(this.form, "p", { className: "rm-note", text: "More props not shown." });
  }

  /** Builds the field's controls; the returned function brings them to a new value. */
  private field(field: SettingsField): Sync {
    const row = element(this.form, "div", {
      className: "rm-field",
      attributes: { "data-prop": field.name },
    });
    const label = element(row, "label");
    element(label, "span", { text: field.name });
    const unset = this.small(row, "Unset", `Unset ${field.name}`, () => {
      this.actions.set(field.name, undefined);
    });
    const definition = field.definition;
    const set = (value: ComponentPropValue | undefined) => {
      this.actions.set(field.name, value);
    };
    const mark = (next: SettingsField) => {
      unset.disabled = next.from !== "settings";
      row.classList.toggle(
        "rm-default",
        next.from === "default" ||
          next.from === "layer" ||
          next.from === "variant" ||
          next.from === "render",
      );
      row.classList.toggle("rm-unset", next.from === "none");
      row.dataset["from"] = next.from;
    };
    if (definition.type === "array") return this.list(row, field, set, mark);
    if (definition.type === "boolean") {
      const box = element(label, "input", { attributes: { type: "checkbox", name: field.name } });
      box.addEventListener("change", () => {
        set(box.checked);
      });
      return (next) => {
        box.checked = next.value === true;
        mark(next);
      };
    }
    if (definition.type === "enum") {
      const select = element(label, "select", { attributes: { name: field.name } });
      const choices = ["", ...definition.values];
      const add = (text: string) => {
        const item = element(select, "option", { text: text === "" ? "(none)" : text });
        item.value = text;
      };
      choices.forEach(add);
      select.addEventListener("change", () => {
        set(select.value === "" ? undefined : select.value);
      });
      return (next) => {
        const text = fieldText(next.value);
        if (!choices.includes(text)) {
          choices.push(text);
          add(text);
        }
        select.value = text;
        mark(next);
      };
    }
    const input = element(label, "input", {
      className: definition.type === "color" ? "rm-color" : "",
      attributes: { name: field.name, type: "text" },
    });
    input.addEventListener("change", () => {
      if (definition.type !== "number") {
        set(input.value);
        return;
      }
      const parsed = parseField({ key: field.name, kind: "number" }, input.value);
      if (parsed.ok) set(parsed.value as ComponentPropValue | undefined);
      else this.actions.invalid(`settings prop "${field.name}": ${parsed.message}`);
    });
    return (next) => {
      // A field being typed in keeps its text until the change is committed.
      if (input.ownerDocument.activeElement !== input) input.value = fieldText(next.value);
      mark(next);
    };
  }

  private list(
    row: HTMLElement,
    field: SettingsField,
    set: (value: ComponentPropValue | undefined) => void,
    mark: Sync,
  ): Sync {
    const count = itemCount(field.value);
    if (count > EditorLimits.maxSettingsListItems) {
      element(row, "p", {
        className: "rm-note",
        text: `The list has ${String(count)} items, more than the ${String(EditorLimits.maxSettingsListItems)} a prop list may have; it is shown read-only.`,
      });
      return mark;
    }
    const inputs: HTMLInputElement[] = [];
    const items = scalars(field.value);
    const current = { items };
    items.forEach((_, index) => {
      const line = element(row, "div", { className: "rm-item" });
      const input = element(line, "input", {
        attributes: {
          type: "text",
          name: `${field.name}[${String(index)}]`,
          "aria-label": `Item ${String(index + 1)} of ${field.name}`,
        },
      });
      inputs.push(input);
      input.addEventListener("change", () => {
        const next = [...current.items];
        next[index] = itemValue(current.items[index], input.value);
        set(next);
      });
      this.small(line, "Remove item", `Remove item ${String(index + 1)} of ${field.name}`, () => {
        set(current.items.filter((_item, at) => at !== index));
      });
    });
    this.small(row, "Add item", `Add item to ${field.name}`, () => {
      set([...current.items, ""]);
    });
    return (next) => {
      current.items = scalars(next.value);
      inputs.forEach((input, index) => {
        if (input.ownerDocument.activeElement !== input) {
          input.value = fieldText(current.items[index]);
        }
      });
      mark(next);
    };
  }

  private small(parent: Element, text: string, name: string, run: () => void): HTMLButtonElement {
    const button = element(parent, "button", {
      text,
      attributes: { type: "button", "aria-label": name },
    });
    button.addEventListener("click", run);
    return button;
  }
}

function scalars(value: ComponentPropValue | undefined): ComponentPropScalar[] {
  return Array.isArray(value) ? [...(value as ComponentPropScalar[])] : [];
}

function itemCount(value: ComponentPropValue | undefined): number {
  return Array.isArray(value) ? (value as readonly unknown[]).length : 0;
}

function listLength(field: SettingsField): number {
  if (field.definition.type !== "array") return -1;
  const items = itemCount(field.value);
  return items > EditorLimits.maxSettingsListItems ? -2 : items;
}

/** An edited list item keeps its kind when the text still fits it: a number stays a number, a boolean a boolean. */
function itemValue(before: ComponentPropScalar | undefined, text: string): ComponentPropScalar {
  if (typeof before === "number") {
    const value = Number(text.trim());
    return text.trim() !== "" && Number.isFinite(value) ? value : text;
  }
  if (typeof before === "boolean" && (text === "true" || text === "false")) return text === "true";
  return text;
}
