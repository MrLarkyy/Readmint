import { renderVariants, type RenderVariant } from "@readmint/format";
import type { NewLayerType } from "./addLayer.js";
import type { EditorManifest } from "./EditorManifest.js";
import type { EditorSettings } from "./EditorSettings.js";
import { element, takeFile } from "./dom.js";
import { designFileOf } from "./rendersOfFile.js";

/** What the toolbar asks the editor to do. */
export interface ToolbarActions {
  newDesign(): void;
  importFile(file: File): void;
  undo(): void;
  redo(): void;
  exportDesign(): void;
  exportYaml(): void;
  exportPng(): void;
  exportWebp(): void;
  exportSettings(): void;
  addLayer(type: NewLayerType): void;
  uploadFont(file: File): void;
  uploadImage(file: File): void;
  loadFixture(file: File): void;
  loadSettings(file: File): void;
  loadManifest(file: File): void;
  chooseRender(name: string | undefined): void;
  chooseSection(section: string | undefined): void;
  chooseVariant(name: string | undefined): void;
  zoom(zoom: number): void;
}

const layerTypes: readonly NewLayerType[] = ["rect", "ellipse", "text", "group"];
const zooms = [0.5, 1, 2, 4];

/**
 * New, import, undo, redo, export (JSON, YAML, PNG, WebP, the settings file), add a layer, upload a font or an image, load fixture data, load a settings file and
 * pick its section, load a render manifest and choose one of its renders, switch the render variant (Light or a named variant, disabled with its reason when the design
 * cannot take one), zoom.
 */
export class Toolbar {
  readonly root: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly exportSettingsButton: HTMLButtonElement;
  private readonly renderSelect: HTMLSelectElement;
  private readonly sectionSelect: HTMLSelectElement;
  private readonly variantSelect: HTMLSelectElement;
  private readonly variantReason: HTMLElement;
  private sectionsKey: string | undefined;
  private rendersKey: string | undefined;

  constructor(parent: Element, actions: ToolbarActions) {
    this.root = element(parent, "div", {
      className: "rm-toolbar",
      attributes: { role: "toolbar", "aria-label": "Editor" },
    });
    this.button("New", "new", () => {
      actions.newDesign();
    });
    this.file("Import design", "import", ".json,.yaml,.yml,application/json", (file) => {
      actions.importFile(file);
    });
    this.undoButton = this.button("Undo", "undo", () => {
      actions.undo();
    });
    this.redoButton = this.button("Redo", "redo", () => {
      actions.redo();
    });
    this.button("Export JSON", "export", () => {
      actions.exportDesign();
    });
    this.button("Export YAML", "export-yaml", () => {
      actions.exportYaml();
    });
    this.button("Export PNG", "export-png", () => {
      actions.exportPng();
    });
    this.button("Export WebP", "export-webp", () => {
      actions.exportWebp();
    });
    this.exportSettingsButton = this.button("Export settings", "export-settings", () => {
      actions.exportSettings();
    });
    for (const type of layerTypes) {
      this.button(`Add ${type}`, `add-${type}`, () => {
        actions.addLayer(type);
      });
    }
    this.file("Upload font", "upload-font", ".ttf,.otf,.woff,.woff2", (file) => {
      actions.uploadFont(file);
    });
    this.file("Upload image", "upload-image", ".png,.jpg,.jpeg,.gif,.webp", (file) => {
      actions.uploadImage(file);
    });
    this.file("Load fixture data", "load-fixture", ".json,application/json", (file) => {
      actions.loadFixture(file);
    });
    this.file("Load settings", "load-settings", ".json,application/json", (file) => {
      actions.loadSettings(file);
    });
    this.file("Load manifest", "load-manifest", ".json,application/json", (file) => {
      actions.loadManifest(file);
    });
    const renderLabel = element(this.root, "label", { text: "Render " });
    this.renderSelect = element(renderLabel, "select", {
      attributes: { "data-action": "render" },
    });
    this.renderSelect.addEventListener("change", () => {
      actions.chooseRender(this.renderSelect.value === "" ? undefined : this.renderSelect.value);
    });
    this.setRenders(undefined, undefined);
    const sectionLabel = element(this.root, "label", { text: "Settings section " });
    this.sectionSelect = element(sectionLabel, "select", {
      attributes: { "data-action": "settings-section" },
    });
    this.sectionSelect.addEventListener("change", () => {
      actions.chooseSection(this.sectionSelect.value === "" ? undefined : this.sectionSelect.value);
    });
    this.setSections(undefined);
    const variantLabel = element(this.root, "label", { text: "Variant " });
    this.variantSelect = element(variantLabel, "select", {
      attributes: { "data-action": "variant" },
    });
    element(this.variantSelect, "option", { text: "Light" }).value = "";
    for (const variant of renderVariants) {
      element(this.variantSelect, "option", { text: capitalize(variant.name) }).value =
        variant.name;
    }
    this.variantSelect.addEventListener("change", () => {
      actions.chooseVariant(this.variantSelect.value === "" ? undefined : this.variantSelect.value);
    });
    this.variantReason = element(this.root, "span", {
      className: "rm-variant-reason",
      attributes: { "aria-live": "polite" },
    });
    const label = element(this.root, "label", { text: "Zoom " });
    const zoom = element(label, "select", { attributes: { "data-action": "zoom" } });
    for (const value of zooms) {
      const option = element(zoom, "option", { text: `${String(value * 100)}%` });
      option.value = String(value);
    }
    zoom.value = "1";
    zoom.addEventListener("change", () => {
      actions.zoom(Number(zoom.value));
    });
  }

  /** Enables undo and redo only when there is something to step to. */
  update(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }

  /**
   * Lists the renders of the loaded manifest (`<name> (<design>)`, as text only) and shows the chosen one; a render of
   * another design file than `designFile` is disabled with its reason. Without a manifest the list is disabled.
   */
  setRenders(manifest: EditorManifest | undefined, designFile: string | undefined): void {
    const select = this.renderSelect;
    const renders = manifest?.renders ?? [];
    const key = JSON.stringify([renders.map((entry) => [entry.name, entry.design]), designFile]);
    // Rebuilt only when the list changes, so an open dropdown survives a refresh.
    if (key !== this.rendersKey) {
      this.rendersKey = key;
      select.replaceChildren();
      element(select, "option", { text: "No render" }).value = "";
      for (const entry of renders) {
        const option = element(select, "option", { text: `${entry.name} (${entry.design})` });
        option.value = entry.name;
        const file = designFileOf(entry.design);
        if (file !== designFile) {
          option.disabled = true;
          option.title = `renders design file ${JSON.stringify(file)}; import it first`;
        }
      }
    }
    select.value = manifest?.render ?? "";
    select.disabled = manifest === undefined;
  }

  /** Lists the sections of the loaded settings file and shows the applied one; without a file the list is disabled. */
  setSections(settings: EditorSettings | undefined): void {
    const select = this.sectionSelect;
    const names = Object.keys(settings?.sections ?? {});
    const key = JSON.stringify(names);
    // Rebuilt only when the list changes, so an open dropdown survives a refresh.
    if (key !== this.sectionsKey) {
      this.sectionsKey = key;
      select.replaceChildren();
      element(select, "option", { text: "No section" }).value = "";
      for (const name of names) element(select, "option", { text: name }).value = name;
    }
    select.value = settings?.section ?? "";
    select.disabled = settings === undefined;
    this.exportSettingsButton.disabled = settings === undefined;
  }

  /**
   * Shows the chosen variant. Without one the switch is disabled while `reason` says the design cannot take a variant
   * (shown, and the select's title); with one it stays enabled so the user can return to Light.
   */
  setVariant(
    current: RenderVariant | undefined,
    reason: string | undefined,
    listed?: { readonly render: string; readonly variants: readonly RenderVariant[] },
  ): void {
    const none = listed !== undefined && listed.variants.length === 0;
    const why = none ? `render ${JSON.stringify(listed.render)} lists no variants` : reason;
    for (const option of this.variantSelect.options) {
      option.disabled =
        listed !== undefined &&
        option.value !== "" &&
        !listed.variants.some((variant) => variant.name === option.value);
    }
    const blocked = why !== undefined && (current === undefined || none);
    this.variantSelect.value = current?.name ?? "";
    this.variantSelect.disabled = blocked;
    this.variantSelect.title = blocked ? why : "";
    this.variantReason.textContent = blocked ? why : "";
  }

  private button(text: string, action: string, run: () => void): HTMLButtonElement {
    const button = element(this.root, "button", {
      text,
      attributes: { type: "button", "data-action": action },
    });
    button.addEventListener("click", run);
    return button;
  }

  private file(text: string, action: string, accept: string, run: (file: File) => void): void {
    const label = element(this.root, "label", { className: "rm-file", text: `${text} ` });
    const input = element(label, "input", {
      attributes: { type: "file", accept, "data-action": action },
    });
    input.addEventListener("change", () => {
      const file = takeFile(input);
      if (file !== undefined) run(file);
    });
  }
}

function capitalize(text: string): string {
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}
