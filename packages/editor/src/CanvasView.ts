import type { LayerBox } from "@readmint/renderer";
import { clear, element } from "./dom.js";
import type { EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";
import { boxAt } from "./layerAt.js";
import { axisAligned, layerDelta, placeBox } from "./boxPlacement.js";
import type { LayerResize } from "./resizeLayer.js";

/** What the canvas asks the editor to do; moves and resizes are in the layer's own coordinates. */
export interface CanvasActions {
  select(pointer: string | undefined): void;
  move(pointer: string, dx: number, dy: number): void;
  resize(pointer: string, box: LayerResize): void;
}

/** The latest preview: the exact SVG bytes and where each drawn layer sits. */
export interface CanvasPreview {
  readonly svg: string;
  readonly boxes: readonly LayerBox[];
}

type Handle = "nw" | "ne" | "sw" | "se";

interface Drag {
  readonly pointer: string;
  readonly handle: Handle | undefined;
  readonly startX: number;
  readonly startY: number;
  readonly box: LayerBox;
  dx: number;
  dy: number;
}

const svgSize = /^<svg [^>]*?width="([0-9.]+)" height="([0-9.]+)"/u;

/**
 * The preview as an `<img>` of the exact SVG bytes (a blob URL), as the CLI preview and a README show it: its ids
 * and styles never meet the page. Over it, the editor's own overlay: the selection outline, corner handles, and
 * pointer input, hit-tested against the renderer's layer boxes.
 */
export class CanvasView {
  readonly root: HTMLElement;
  readonly image: HTMLImageElement;
  private readonly stage: HTMLElement;
  private readonly overlay: HTMLElement;
  private url: string | undefined;
  private svg: string | undefined;
  private boxes: readonly LayerBox[] = [];
  private state: EditorState | undefined;
  private drag: Drag | undefined;
  private zoom = 1;
  private width = 0;
  private height = 0;

  constructor(
    parent: Element,
    private readonly actions: CanvasActions,
  ) {
    this.root = element(parent, "section", { className: "rm-canvas" });
    this.stage = element(this.root, "div", {
      className: "rm-stage",
      style: { position: "relative", display: "inline-block" },
    });
    this.image = element(this.stage, "img", {
      attributes: { alt: "Preview", draggable: "false" },
      style: { display: "block" },
    });
    this.overlay = element(this.stage, "div", {
      className: "rm-overlay",
      attributes: { "data-testid": "overlay" },
      style: { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" },
    });
    this.overlay.addEventListener("pointerdown", (event) => {
      this.pointerDown(event);
    });
    const view = this.root.ownerDocument.defaultView;
    view?.addEventListener("pointermove", this.pointerMove);
    view?.addEventListener("pointerup", this.pointerUp);
  }

  /** Shows a new preview; the previous blob URL is revoked. */
  showPreview(preview: CanvasPreview): void {
    if (preview.svg !== this.svg) {
      this.svg = preview.svg;
      if (this.url !== undefined) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(new Blob([preview.svg], { type: "image/svg+xml" }));
      this.image.src = this.url;
      const size = svgSize.exec(preview.svg);
      this.width = Number(size?.[1] ?? 0);
      this.height = Number(size?.[2] ?? 0);
    }
    this.boxes = preview.boxes;
    this.layout();
  }

  /**
   * Forgets the layer boxes after a render that failed: the image still shows the last good render, but its boxes may
   * no longer match the design, so the canvas selects nothing until a render succeeds.
   */
  clearBoxes(): void {
    this.boxes = [];
    this.drawSelection();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.layout();
  }

  /**
   * Shows the state's selection. A drag under way when the design changes (undo, redo, an upload finishing) is dropped:
   * its layer pointer and box belong to the design it started on.
   */
  update(state: EditorState): void {
    if (this.drag !== undefined && state.design !== this.state?.design) this.drag = undefined;
    this.state = state;
    this.drawSelection();
  }

  dispose(): void {
    const view = this.root.ownerDocument.defaultView;
    view?.removeEventListener("pointermove", this.pointerMove);
    view?.removeEventListener("pointerup", this.pointerUp);
    if (this.url !== undefined) URL.revokeObjectURL(this.url);
  }

  private layout(): void {
    this.image.style.width = `${String(this.width * this.zoom)}px`;
    this.image.style.height = `${String(this.height * this.zoom)}px`;
    this.drawSelection();
  }

  private drawSelection(): void {
    clear(this.overlay);
    const selection = this.state?.selection;
    if (selection === undefined) return;
    let first = true;
    for (const box of this.boxes) {
      if (box.layer !== selection) continue;
      const place = placeBox(box);
      let { cx, cy } = place;
      let { width, height } = box;
      const drag = this.drag?.box === box ? this.drag : undefined;
      if (drag?.handle === undefined) {
        cx += drag?.dx ?? 0;
        cy += drag?.dy ?? 0;
      } else {
        const resizedBox = draggedBox(drag);
        ({ width, height } = resizedBox);
        cx = resizedBox.x + width / 2;
        cy = resizedBox.y + height / 2;
      }
      const turned = place.degrees % 360 !== 0;
      const outline = element(this.overlay, "div", {
        className: "rm-selection",
        style: {
          position: "absolute",
          left: `${String((cx - width / 2) * this.zoom)}px`,
          top: `${String((cy - height / 2) * this.zoom)}px`,
          width: `${String(width * this.zoom)}px`,
          height: `${String(height * this.zoom)}px`,
          transform: turned ? `rotate(${String(place.degrees)}deg)` : "",
          outline: "1px solid #0969da",
          pointerEvents: "none",
        },
      });
      if (first && axisAligned(box)) this.handles(outline);
      first = false;
    }
  }

  private handles(outline: HTMLElement): void {
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      element(outline, "div", {
        className: `rm-handle rm-handle-${handle}`,
        attributes: { "data-handle": handle },
        style: {
          position: "absolute",
          left: handle.endsWith("w") ? "-4px" : "calc(100% - 4px)",
          top: handle.startsWith("n") ? "-4px" : "calc(100% - 4px)",
          width: "8px",
          height: "8px",
          background: "#0969da",
          pointerEvents: "auto",
          cursor: handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize",
        },
      });
    }
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.overlay.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / this.zoom,
      y: (event.clientY - rect.top) / this.zoom,
    };
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.state === undefined) return;
    event.preventDefault();
    const point = this.canvasPoint(event);
    const handleName = (event.target as Element).getAttribute("data-handle");
    const selection = this.state.selection;
    const selected =
      selection === undefined ? undefined : this.boxes.find((box) => box.layer === selection);
    const handle =
      isHandle(handleName) && selected !== undefined && axisAligned(selected)
        ? handleName
        : undefined;
    const box = handle === undefined ? boxAt(this.boxes, point.x, point.y) : selected;
    if (box === undefined) {
      this.actions.select(undefined);
      return;
    }
    if (box.layer !== selection) this.actions.select(box.layer);
    this.drag = {
      pointer: box.layer,
      handle,
      startX: point.x,
      startY: point.y,
      box,
      dx: 0,
      dy: 0,
    };
  }

  private readonly pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === undefined) return;
    const point = this.canvasPoint(event);
    drag.dx = point.x - drag.startX;
    drag.dy = point.y - drag.startY;
    this.drawSelection();
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === undefined) return;
    this.pointerMove(event);
    this.drag = undefined;
    this.drawSelection();
    if (drag.dx === 0 && drag.dy === 0) return;
    const { x: dx, y: dy } = layerDelta(drag.box, drag.dx, drag.dy);
    if (drag.handle === undefined) {
      this.actions.move(drag.pointer, dx, dy);
      return;
    }
    const layer = this.state === undefined ? undefined : findLayer(this.state.design, drag.pointer);
    if (layer === undefined) return;
    this.actions.resize(drag.pointer, resized(drag.handle, layer, drag.box, dx, dy));
  };
}

function isHandle(name: string | null): name is Handle {
  return name === "nw" || name === "ne" || name === "sw" || name === "se";
}

/** The box shown while dragging: moved, or resized from the dragged corner. */
function draggedBox(drag: Drag): LayerBox {
  const { box, dx, dy, handle } = drag;
  if (handle === undefined) return { ...box, x: box.x + dx, y: box.y + dy };
  const west = handle.endsWith("w");
  const north = handle.startsWith("n");
  return {
    ...box,
    x: west ? box.x + dx : box.x,
    y: north ? box.y + dy : box.y,
    width: Math.max(1, west ? box.width - dx : box.width + dx),
    height: Math.max(1, north ? box.height - dy : box.height + dy),
  };
}

/** The layer box after dragging `handle` by (`dx`, `dy`) in the layer's coordinates. */
function resized(
  handle: Handle,
  layer: { x?: unknown; y?: unknown },
  box: LayerBox,
  dx: number,
  dy: number,
): LayerResize {
  const west = handle.endsWith("w");
  const north = handle.startsWith("n");
  const x = typeof layer.x === "number" ? layer.x : 0;
  const y = typeof layer.y === "number" ? layer.y : 0;
  return {
    ...(west ? { x: x + dx } : {}),
    ...(north ? { y: y + dy } : {}),
    width: west ? box.width - dx : box.width + dx,
    height: north ? box.height - dy : box.height + dy,
  };
}
