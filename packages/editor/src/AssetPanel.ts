import type { FontAsset } from "@readmint/format";
import { decodeDataUri } from "./base64.js";
import { clear, element, takeFile } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import type { FontAssetChange } from "./setFontAsset.js";

/** What the asset panel asks the editor to do. */
export interface AssetActions {
  changeFont(id: string, change: FontAssetChange): void;
  /** The file is read by the editor once its size is checked. */
  attach(kind: "fonts" | "images", id: string, file: File): void;
}

/**
 * The design's fonts with their licence, its embedded images, and every asset whose `src` is a path: those need the
 * file for the preview (the CLI reads it from the path); the design keeps the path.
 */
export class AssetPanel {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private shown: readonly unknown[] = [];

  constructor(
    parent: Element,
    private readonly actions: AssetActions,
  ) {
    this.root = element(parent, "section", { className: "rm-assets" });
    element(this.root, "h2", { text: "Assets" });
    this.body = element(this.root, "div");
  }

  update(state: EditorState): void {
    const key = [state.design.assets, state.fontChecks, state.sessionAssets];
    if (key.every((item, index) => item === this.shown[index])) return;
    this.shown = key;
    clear(this.body);
    const assets = state.design.assets;
    for (const [id, asset] of Object.entries(assets?.fonts ?? {})) this.font(state, id, asset);
    for (const [id, asset] of Object.entries(assets?.images ?? {})) {
      if (asset.src.startsWith("{{")) {
        element(this.body, "p", {
          className: "rm-note",
          text: `image ${id}: bound to data; the editor never fetches it (the CLI and the Action do)`,
        });
      } else if (asset.src.startsWith("data:")) {
        // Listed by its prefix alone: decoding megabytes on every change would buy nothing, the preview checks it.
        element(this.body, "p", {
          className: "rm-note",
          text: `image ${id}: embedded in the design`,
          attributes: { "data-image": id },
        });
      } else {
        this.pathAsset(state, "images", id, asset.src, this.body);
      }
    }
  }

  private font(state: EditorState, id: string, asset: FontAsset): void {
    const box = element(this.body, "fieldset", {
      className: "rm-font",
      attributes: { "data-font": id },
    });
    const weight = asset.weight === undefined ? "" : ` ${String(asset.weight)}`;
    const style = asset.style === "italic" ? " italic" : "";
    element(box, "legend", { text: `${id}: ${asset.family}${weight}${style}` });
    if (decodeDataUri(asset.src) === undefined) this.pathAsset(state, "fonts", id, asset.src, box);
    const check = Object.hasOwn(state.fontChecks, id) ? state.fontChecks[id] : undefined;
    const locked = check?.embeddable === false;
    const label = element(box, "label", { text: "embedding " });
    const embedding = element(label, "select", { attributes: { name: "embedding" } });
    for (const option of ["allowed", "restricted"] as const) {
      const item = element(embedding, "option", { text: option });
      item.value = option;
      item.disabled = option === "allowed" && locked;
    }
    embedding.value = asset.licence.embedding;
    embedding.disabled = locked;
    embedding.addEventListener("change", () => {
      this.actions.changeFont(id, {
        embedding: embedding.value === "allowed" ? "allowed" : "restricted",
      });
    });
    if (check !== undefined && locked) {
      const fsType = `0x${check.fsType.toString(16).padStart(4, "0")}`;
      element(box, "p", {
        className: "rm-note",
        text: `the font forbids embedding (OS/2 fsType ${fsType}): drawn as paths, never embedded`,
      });
    } else if (asset.licence.embedding === "restricted") {
      element(box, "p", { className: "rm-note", text: "restricted: drawn as paths" });
    }
    const licenceLabel = element(box, "label", { text: "licence (SPDX) " });
    const licence = element(licenceLabel, "input", { attributes: { name: "licence" } });
    licence.value = asset.licence.name ?? "";
    licence.addEventListener("change", () => {
      this.actions.changeFont(id, { licenceName: licence.value.trim() });
    });
  }

  private pathAsset(
    state: EditorState,
    kind: "fonts" | "images",
    id: string,
    src: string,
    parent: Element,
  ): void {
    const session = state.sessionAssets[kind];
    const attached = session !== undefined && Object.hasOwn(session, id);
    const label = element(parent, "label", {
      className: "rm-path-asset",
      text: `${kind === "fonts" ? "font" : "image"} ${id} (${src}): ${attached ? "file attached" : "needs file"} `,
    });
    const input = element(label, "input", {
      attributes: { type: "file", "data-attach": `${kind}/${id}` },
    });
    input.addEventListener("change", () => {
      const file = takeFile(input);
      if (file !== undefined) this.actions.attach(kind, id, file);
    });
  }
}
