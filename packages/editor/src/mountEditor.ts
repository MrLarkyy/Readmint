import { DesignLimits, type Design } from "@readmint/format";
import { addLayer, type NewLayerType } from "./addLayer.js";
import { AssetPanel } from "./AssetPanel.js";
import { attachAsset } from "./attachAsset.js";
import { CanvasView } from "./CanvasView.js";
import { refuse } from "./commitDesign.js";
import { createPreviewWorker } from "./createPreviewWorker.js";
import { createRasterWorker } from "./createRasterWorker.js";
import { element, readCapped } from "./dom.js";
import {
  canRedo,
  canUndo,
  createHistory,
  recordEdit,
  redo,
  undo,
  type EditorHistory,
  type HistoryStep,
} from "./EditorHistory.js";
import type { EditorIssue } from "./EditorIssue.js";
import { EditorLimits } from "./EditorLimits.js";
import { createEditorState, type EditorState } from "./EditorState.js";
import { exportDesign } from "./exportDesign.js";
import { exportDesignYaml } from "./exportDesignYaml.js";
import { importDesign } from "./importDesign.js";
import { IssueList } from "./IssueList.js";
import { findLayer } from "./layerAccess.js";
import { LayerTreeView } from "./LayerTreeView.js";
import { loadFixture } from "./loadFixture.js";
import { moveLayer } from "./moveLayer.js";
import { newDesign } from "./newDesign.js";
import { PreviewClient, type PreviewOutcome, type PreviewWorker } from "./PreviewClient.js";
import { PropertyPanel } from "./PropertyPanel.js";
import type { EditorRasterFormat } from "./RasterExportInput.js";
import { RasterClient, type RasterWorker } from "./RasterClient.js";
import { removeLayer } from "./removeLayer.js";
import { reorderLayer } from "./reorderLayer.js";
import { resizeLayer } from "./resizeLayer.js";
import { selectLayer } from "./selectLayer.js";
import { setFontAsset } from "./setFontAsset.js";
import { setLayerProperty } from "./setLayerProperty.js";
import { Toolbar } from "./Toolbar.js";

/** A design file the editor hands over to be saved. */
export interface SavedDesign {
  readonly name: string;
  readonly text: string;
}

/** A raster image the editor hands over to be saved. */
export interface SavedImage {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface MountEditorOptions {
  /** The design to start with; default an empty canvas. */
  readonly initial?: Design;
  /** Receives the exported design file; default a download in the browser. */
  readonly save?: (file: SavedDesign) => void;
  /** Receives the exported image (`design.png`, `design.webp`); default a download in the browser. */
  readonly saveImage?: (file: SavedImage) => void;
  /** The raster worker; default the bundled `rasterWorker`, started for each export. */
  readonly createRasterWorker?: () => RasterWorker;
  /** Default `EditorLimits.rasterTimeoutMs`. */
  readonly rasterTimeoutMs?: number;
  /** The preview worker; default the bundled `previewWorker`. */
  readonly createWorker?: () => PreviewWorker;
  /** Default `EditorLimits.renderTimeoutMs`. */
  readonly renderTimeoutMs?: number;
}

export interface EditorHandle {
  readonly state: EditorState;
  /** The SVG the preview shows, byte for byte. */
  readonly svg: string | undefined;
  /** Applies a command to the state and updates the views and the preview; a design change can be undone. */
  dispatch(command: (state: EditorState) => EditorState): void;
  /** Steps back to the design and selection before the newest edit; nothing when there is none. */
  undo(): void;
  /** Steps forward to the design and selection the newest undo left; nothing when there is none. */
  redo(): void;
  /** Resolves once file reads, lazy loads and preview renders started so far have settled. */
  settled(): Promise<void>;
  destroy(): void;
}

/**
 * Mounts the editor into `root`: toolbar, layer tree and assets, the canvas with the live preview, the property
 * panel and the issues. Every change goes through a pure command; the preview renders in a worker.
 */
export function mountEditor(root: HTMLElement, options: MountEditorOptions = {}): EditorHandle {
  let state = createEditorState(options.initial ?? newDesign());
  let history: EditorHistory = createHistory();
  let previewIssues: readonly EditorIssue[] = [];
  let svg: string | undefined;
  const pending = new Set<Promise<unknown>>();
  const shell = element(root, "div", { className: "rm-editor" });

  /** Applies `command`; its design change becomes an undo entry, or, with `fresh`, the history starts over. */
  const apply = (command: (current: EditorState) => EditorState, fresh: boolean) => {
    const before = state;
    state = command(state);
    history = fresh ? createHistory() : recordEdit(history, before, state);
    if (
      state.design !== before.design ||
      state.data !== before.data ||
      state.sessionAssets !== before.sessionAssets
    ) {
      client.render(state);
    }
    show();
  };
  const dispatch = (command: (current: EditorState) => EditorState) => {
    apply(command, false);
  };
  const step = (
    move: (history: EditorHistory, current: EditorState) => HistoryStep | undefined,
  ) => {
    const result = move(history, state);
    if (result === undefined) return;
    history = result.history;
    state = result.state;
    client.render(state);
    show();
  };
  const track = (work: Promise<unknown>) => {
    const done = work.finally(() => pending.delete(done));
    pending.add(done);
  };
  const report = (source: EditorIssue["source"], message: string) => {
    dispatch((current) => refuse(current, source, message));
  };
  const saveDesign = (file: SavedDesign, mimeType: string) => {
    if (options.save === undefined) download(root, file.name, file.text, mimeType);
    else options.save(file);
  };
  const raster = new RasterClient({
    createWorker: options.createRasterWorker ?? createRasterWorker,
    timeoutMs: options.rasterTimeoutMs ?? EditorLimits.rasterTimeoutMs,
  });
  const exportImage = (format: EditorRasterFormat) => {
    if (raster.busy) {
      report("export", "a raster export is already running; wait for it to finish");
      return;
    }
    const { design, data, sessionAssets } = state;
    track(
      raster.export({ design, data, sessionAssets, format }).then((outcome) => {
        switch (outcome.kind) {
          case "exported": {
            const image = {
              name: `design.${format}`,
              mimeType: outcome.file.mimeType,
              bytes: outcome.file.bytes,
            };
            if (options.saveImage === undefined) {
              download(root, image.name, image.bytes, image.mimeType);
            } else options.saveImage(image);
            return;
          }
          case "failed":
            report("export", `the ${format} export failed: ${outcome.message}`);
            return;
          case "timeout":
            report(
              "export",
              `the ${format} export took longer than ${String(outcome.timeoutMs)} ms and was stopped; simplify the design`,
            );
            return;
          case "busy":
            report("export", "a raster export is already running; wait for it to finish");
        }
      }),
    );
  };
  const withFonts = () => {
    track(
      import("./checkFonts.js").then(({ checkFonts }) => {
        dispatch(checkFonts);
      }),
    );
  };

  const toolbar = new Toolbar(shell, {
    newDesign: () => {
      apply((current) => ({ ...createEditorState(newDesign()), data: current.data }), true);
    },
    importFile: (file) => {
      if (file.size > DesignLimits.maxSourceLength * 3) {
        report(
          "import",
          `the design file is larger than ${String(DesignLimits.maxSourceLength)} characters`,
        );
        return;
      }
      track(
        file
          .text()
          .then((text) => importDesign(text))
          .then((result) => {
            if (!result.ok) {
              dispatch((current) => ({
                ...current,
                issues: result.issues.map((issue) => ({
                  source: "import" as const,
                  message:
                    issue.line === undefined
                      ? issue.message
                      : `line ${String(issue.line)}: ${issue.message}`,
                  path: issue.path,
                })),
              }));
              return;
            }
            apply((current) => ({ ...createEditorState(result.value), data: current.data }), true);
            withFonts();
          }),
      );
    },
    undo: () => {
      step(undo);
    },
    redo: () => {
      step(redo);
    },
    exportDesign: () => {
      saveDesign({ name: "design.json", text: exportDesign(state.design) }, "application/json");
    },
    exportYaml: () => {
      track(
        exportDesignYaml(state.design).then((result) => {
          if (result.ok) saveDesign({ name: "design.yaml", text: result.text }, "application/yaml");
          else report("export", result.message);
        }),
      );
    },
    exportPng: () => {
      exportImage("png");
    },
    exportWebp: () => {
      exportImage("webp");
    },
    addLayer: (type: NewLayerType) => {
      dispatch((current) => addLayer(current, type, selectedGroup(current)));
    },
    uploadFont: (file) => {
      if (file.size > EditorLimits.maxFontBytes) {
        report(
          "font",
          `font ${JSON.stringify(file.name)} is ${String(file.size)} bytes, more than the ${String(EditorLimits.maxFontBytes)} a font may have`,
        );
        return;
      }
      track(
        Promise.all([readCapped(file, EditorLimits.maxFontBytes), import("./uploadFont.js")]).then(
          ([bytes, { uploadFont }]) => {
            if (bytes !== undefined) {
              dispatch((current) => uploadFont(current, { name: file.name, bytes }));
            }
          },
        ),
      );
    },
    uploadImage: (file) => {
      if (file.size > EditorLimits.maxImageBytes) {
        report(
          "image",
          `image ${JSON.stringify(file.name.slice(0, 128))} is ${String(file.size)} bytes, more than the ${String(EditorLimits.maxImageBytes)} an image may have`,
        );
        return;
      }
      track(
        Promise.all([
          readCapped(file, EditorLimits.maxImageBytes),
          import("./uploadImage.js"),
        ]).then(([bytes, { uploadImage }]) => {
          if (bytes !== undefined) {
            dispatch((current) =>
              uploadImage(current, { name: file.name, bytes }, selectedGroup(current)),
            );
          }
        }),
      );
    },
    loadFixture: (file) => {
      if (file.size > EditorLimits.maxFixtureBytes) {
        report(
          "fixture",
          `fixture data is larger than ${String(EditorLimits.maxFixtureBytes)} bytes`,
        );
        return;
      }
      track(
        file.text().then((text) => {
          dispatch((current) => loadFixture(current, text));
        }),
      );
    },
    zoom: (zoom) => {
      canvas.setZoom(zoom);
    },
  });

  const main = element(shell, "div", { className: "rm-main" });
  const side = element(main, "div", { className: "rm-side" });
  const select = (pointer: string | undefined) => {
    dispatch((current) => selectLayer(current, pointer));
  };
  const tree = new LayerTreeView(side, {
    select,
    reorder: (pointer, index) => {
      dispatch((current) => reorderLayer(current, pointer, index));
    },
    remove: (pointer) => {
      dispatch((current) => removeLayer(current, pointer));
    },
  });
  const assets = new AssetPanel(side, {
    changeFont: (id, change) => {
      dispatch((current) => setFontAsset(current, id, change));
    },
    attach: (kind, id, file) => {
      const max = kind === "fonts" ? EditorLimits.maxFontBytes : EditorLimits.maxImageBytes;
      if (file.size > max) {
        report(
          "asset",
          `the file for ${kind === "fonts" ? "font" : "image"} ${JSON.stringify(id)} is ${String(file.size)} bytes, more than the ${String(max)} allowed`,
        );
        return;
      }
      track(
        readCapped(file, max).then((bytes) => {
          if (bytes === undefined) return;
          dispatch((current) => attachAsset(current, kind, id, bytes));
          if (kind === "fonts") withFonts();
        }),
      );
    },
  });
  const canvas = new CanvasView(main, {
    select,
    move: (pointer, dx, dy) => {
      dispatch((current) => moveLayer(current, pointer, dx, dy));
    },
    resize: (pointer, box) => {
      dispatch((current) => resizeLayer(current, pointer, box));
    },
  });
  const properties = new PropertyPanel(main, {
    set: (pointer, key, value) => {
      dispatch((current) => setLayerProperty(current, pointer, key, value));
    },
    invalid: (message, path) => {
      dispatch((current) => refuse(current, "design", message, path));
    },
  });
  const issues = new IssueList(shell, select);

  const show = () => {
    toolbar.update(canUndo(history), canRedo(history));
    tree.update(state);
    assets.update(state);
    canvas.update(state);
    properties.update(state);
    issues.update([...state.issues, ...previewIssues]);
  };

  const client = new PreviewClient({
    createWorker: options.createWorker ?? createPreviewWorker,
    timeoutMs: options.renderTimeoutMs ?? EditorLimits.renderTimeoutMs,
    onOutcome: (outcome: PreviewOutcome) => {
      previewIssues = outcomeIssues(outcome);
      if (outcome.kind === "rendered" && outcome.result.ok) {
        svg = outcome.result.svg;
        canvas.showPreview({ svg, boxes: outcome.result.layerBoxes ?? [] });
      } else {
        canvas.clearBoxes();
      }
      show();
    },
  });

  const keydown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || editable(event.target)) return;
    const key = event.key.toLowerCase();
    const move = key === "z" ? (event.shiftKey ? redo : undo) : key === "y" ? redo : undefined;
    if (move === undefined) return;
    event.preventDefault();
    step(move);
  };
  root.ownerDocument.addEventListener("keydown", keydown);

  client.render(state);
  show();
  if (options.initial !== undefined) withFonts();

  return {
    get state() {
      return state;
    },
    get svg() {
      return svg;
    },
    dispatch,
    undo: () => {
      step(undo);
    },
    redo: () => {
      step(redo);
    },
    settled: async () => {
      while (pending.size > 0) await Promise.allSettled([...pending]);
      await client.idle();
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    destroy: () => {
      root.ownerDocument.removeEventListener("keydown", keydown);
      raster.dispose();
      client.dispose();
      canvas.dispose();
      shell.remove();
    },
  };
}

/** The selected layer when it is a group, which a new layer goes into. */
function selectedGroup(state: EditorState): string | undefined {
  const selected = state.selection;
  return selected !== undefined && findLayer(state.design, selected)?.type === "group"
    ? selected
    : undefined;
}

/** Whether a key goes to a field that has its own undo: the editor's shortcuts leave it alone. */
function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** What the issue list shows for a preview: the render's issues or warnings, or why there is no render. */
function outcomeIssues(outcome: PreviewOutcome): EditorIssue[] {
  switch (outcome.kind) {
    case "rendered": {
      const list = outcome.result.ok ? outcome.result.warnings : outcome.result.issues;
      return list.map((issue) => ({ source: "preview", message: issue.message, path: issue.path }));
    }
    case "failed":
      return [{ source: "preview", message: `the preview failed: ${outcome.message}` }];
    case "timeout":
      return [
        {
          source: "preview",
          message: `the preview took longer than ${String(outcome.timeoutMs)} ms and was stopped; simplify the design`,
        },
      ];
  }
}

/** Offers the file as a download through a temporary link. */
function download(
  root: HTMLElement,
  name: string,
  content: string | Uint8Array,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type: mimeType }));
  const link = element(root, "a", { attributes: { href: url, download: name } });
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
