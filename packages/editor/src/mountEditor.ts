import { DesignLimits, type Design } from "@readmint/format";
import { addLayer, type NewLayerType } from "./addLayer.js";
import { AssetPanel } from "./AssetPanel.js";
import { attachAsset } from "./attachAsset.js";
import { CanvasView } from "./CanvasView.js";
import { refuse } from "./commitDesign.js";
import { createPreviewWorker } from "./createPreviewWorker.js";
import { element, readCapped } from "./dom.js";
import type { EditorIssue } from "./EditorIssue.js";
import { EditorLimits } from "./EditorLimits.js";
import { createEditorState, type EditorState } from "./EditorState.js";
import { exportDesign } from "./exportDesign.js";
import { importDesign } from "./importDesign.js";
import { IssueList } from "./IssueList.js";
import { findLayer } from "./layerAccess.js";
import { LayerTreeView } from "./LayerTreeView.js";
import { loadFixture } from "./loadFixture.js";
import { moveLayer } from "./moveLayer.js";
import { newDesign } from "./newDesign.js";
import { PreviewClient, type PreviewOutcome, type PreviewWorker } from "./PreviewClient.js";
import { PropertyPanel } from "./PropertyPanel.js";
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

export interface MountEditorOptions {
  /** The design to start with; default an empty canvas. */
  readonly initial?: Design;
  /** Receives the exported design file; default a download in the browser. */
  readonly save?: (file: SavedDesign) => void;
  /** The preview worker; default the bundled `previewWorker`. */
  readonly createWorker?: () => PreviewWorker;
  /** Default `EditorLimits.renderTimeoutMs`. */
  readonly renderTimeoutMs?: number;
}

export interface EditorHandle {
  readonly state: EditorState;
  /** The SVG the preview shows, byte for byte. */
  readonly svg: string | undefined;
  /** Applies a command to the state and updates the views and the preview. */
  dispatch(command: (state: EditorState) => EditorState): void;
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
  let previewIssues: readonly EditorIssue[] = [];
  let svg: string | undefined;
  const pending = new Set<Promise<unknown>>();
  const shell = element(root, "div", { className: "rm-editor" });

  const dispatch = (command: (current: EditorState) => EditorState) => {
    const before = state;
    state = command(state);
    if (
      state.design !== before.design ||
      state.data !== before.data ||
      state.sessionAssets !== before.sessionAssets
    ) {
      client.render(state);
    }
    show();
  };
  const track = (work: Promise<unknown>) => {
    const done = work.finally(() => pending.delete(done));
    pending.add(done);
  };
  const report = (source: EditorIssue["source"], message: string) => {
    dispatch((current) => refuse(current, source, message));
  };
  const withFonts = () => {
    track(
      import("./checkFonts.js").then(({ checkFonts }) => {
        dispatch(checkFonts);
      }),
    );
  };

  new Toolbar(shell, {
    newDesign: () => {
      dispatch((current) => ({ ...createEditorState(newDesign()), data: current.data }));
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
            dispatch((current) => ({ ...createEditorState(result.value), data: current.data }));
            withFonts();
          }),
      );
    },
    exportDesign: () => {
      const file = { name: "design.json", text: exportDesign(state.design) };
      if (options.save === undefined) download(root, file);
      else options.save(file);
    },
    addLayer: (type: NewLayerType) => {
      dispatch((current) => {
        const selected = current.selection;
        const group =
          selected !== undefined && findLayer(current.design, selected)?.type === "group";
        return addLayer(current, type, group ? selected : undefined);
      });
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
    settled: async () => {
      while (pending.size > 0) await Promise.allSettled([...pending]);
      await client.idle();
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    destroy: () => {
      client.dispose();
      canvas.dispose();
      shell.remove();
    },
  };
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
function download(root: HTMLElement, file: SavedDesign): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
  const link = element(root, "a", { attributes: { href: url, download: file.name } });
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
