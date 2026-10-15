/** A turn of a group: `degrees` clockwise about (`cx`, `cy`), in the coordinates `LayerBox` gives its box in. */
export interface LayerTurn {
  readonly degrees: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Where a drawn node of the render sits on the canvas, for the editor's selection. Boxes are given in paint order
 * (later boxes are drawn over earlier ones), one per drawn node, at the node's layout position: animations do not
 * move it. The renderer does no trigonometry: a turned box is described by its turns, the reader applies them.
 */
export interface LayerBox {
  /**
   * JSON Pointer of the design layer under `/layers` that drew the node. Every repeat copy of a layer gives the same
   * pointer; the layers of a component definition give the pointer of their instance.
   */
  readonly layer: string;
  /**
   * The box before any turn: the node's position plus those of its groups, on the canvas; rounded to 3 decimals as
   * the SVG numbers are.
   */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Degrees the node turns clockwise about the centre of its box; absent when it does not turn. */
  readonly rotation?: number;
  /**
   * The turns of the groups around the node, innermost first, applied after its own: on the canvas, the box is turned
   * by `rotation` about its centre, then by each of these. Absent when no group around it turns.
   */
  readonly groupTurns?: readonly LayerTurn[];
}
