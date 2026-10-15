import type { LayerBox } from "@readmint/renderer";
import { unturnPoint } from "./boxPlacement.js";

/** The box drawn topmost at canvas point (`x`, `y`): the last box containing it, its turns undone. */
export function boxAt(boxes: readonly LayerBox[], x: number, y: number): LayerBox | undefined {
  for (let index = boxes.length - 1; index >= 0; index--) {
    const box = boxes[index];
    if (box !== undefined && contains(box, x, y)) return box;
  }
  return undefined;
}

/** The design pointer of the layer drawn topmost at canvas point (`x`, `y`). */
export function layerAt(boxes: readonly LayerBox[], x: number, y: number): string | undefined {
  return boxAt(boxes, x, y)?.layer;
}

function contains(box: LayerBox, x: number, y: number): boolean {
  const point = unturnPoint(box, x, y);
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}
