/**
 * Where a drawn node of the render sits on the canvas, for the editor's selection. Boxes are given in paint order
 * (later boxes are drawn over earlier ones), one per drawn node, at the node's layout position: animations do not
 * move it.
 */
export interface LayerBox {
  /**
   * JSON Pointer of the design layer under `/layers` that drew the node. Every repeat copy of a layer gives the same
   * pointer; the layers of a component definition give the pointer of their instance.
   */
  readonly layer: string;
  /** Left edge of the unrotated box on the canvas, rounded to 3 decimals as the SVG numbers are. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Degrees the box is turned clockwise about its centre: the node's rotation plus those of its groups. Absent when
   * nothing turns it.
   */
  readonly rotation?: number;
}
