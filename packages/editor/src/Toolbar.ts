import type { NewLayerType } from "./addLayer.js";
import { element, takeFile } from "./dom.js";

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
  addLayer(type: NewLayerType): void;
  uploadFont(file: File): void;
  uploadImage(file: File): void;
  loadFixture(file: File): void;
  zoom(zoom: number): void;
}

const layerTypes: readonly NewLayerType[] = ["rect", "ellipse", "text", "group"];
const zooms = [0.5, 1, 2, 4];

/**
 * New, import, undo, redo, export (JSON, YAML, PNG, WebP), add a layer, upload a font or an image, load fixture data,
 * zoom.
 */
export class Toolbar {
  readonly root: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;

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
