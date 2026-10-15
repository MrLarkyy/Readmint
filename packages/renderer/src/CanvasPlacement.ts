import type { Bounds } from "./pathBounds.js";
import { placeThrough, type PlacementStep } from "./PlacementStep.js";

/**
 * The transforms between the node being drawn and the canvas, outermost first, as the groups written so far apply
 * them; with the canvas size, whether a box lies wholly outside the canvas.
 */
export class CanvasPlacement {
  private readonly steps: PlacementStep[] = [];
  private canvas: { readonly width: number; readonly height: number } | undefined;

  /** The canvas boxes are tested against; before it is set, no box lies outside. */
  setCanvas(width: number, height: number): void {
    this.canvas = { width, height };
  }

  /** Runs `body` with `steps` (outermost first) inside the current ones. */
  within<T>(steps: readonly PlacementStep[], body: () => T): T {
    const depth = this.steps.length;
    this.steps.push(...steps);
    try {
      return body();
    } finally {
      this.steps.length = depth;
    }
  }

  /** `bounds`, in the coordinates of the innermost step, on the canvas; undefined when a step is unknown. */
  toCanvas(bounds: Bounds | undefined): Bounds | undefined {
    return placeThrough(bounds, this.steps);
  }

  /** Whether `bounds` lie wholly at or beyond an edge of the canvas; unknown bounds never do. */
  isOutside(bounds: Bounds | undefined): boolean {
    const canvas = this.canvas;
    const placed = this.toCanvas(bounds);
    if (canvas === undefined || placed === undefined) return false;
    return (
      placed.maxX <= 0 ||
      placed.maxY <= 0 ||
      placed.minX >= canvas.width ||
      placed.minY >= canvas.height
    );
  }
}
