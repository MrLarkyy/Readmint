import type { RenderNode } from "./RenderNode.js";

/** A group layout with its numbers evaluated. */
export type ResolvedLayout =
  | { readonly type: "absolute" }
  | {
      readonly type: "stack";
      readonly direction: "row" | "column";
      readonly gap: number;
      readonly align: "start" | "center" | "end";
    }
  | { readonly type: "grid"; readonly columns: number; readonly gap: number };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The group's explicit width and height, when it has them. */
export interface ExplicitSize {
  readonly width: number | undefined;
  readonly height: number | undefined;
}

/**
 * Moves the children to their place in the group and returns the content extent (the furthest right and bottom
 * edge, at least 0). In a stack or grid a child's own `x`/`y` is an offset inside its slot. `size` holds the
 * group's explicit width/height, used for stack cross-axis alignment and grid column width.
 */
export function placeChildren(
  layout: ResolvedLayout,
  children: readonly RenderNode[],
  size: ExplicitSize,
): Size {
  if (layout.type === "stack") placeStack(layout, children, size);
  else if (layout.type === "grid") placeGrid(layout, children, size.width);
  return extent(children);
}

export function extent(children: readonly RenderNode[]): Size {
  let width = 0;
  let height = 0;
  for (const child of children) {
    width = Math.max(width, child.x + child.width);
    height = Math.max(height, child.y + child.height);
  }
  return { width, height };
}

function placeStack(
  layout: Extract<ResolvedLayout, { type: "stack" }>,
  children: readonly RenderNode[],
  size: ExplicitSize,
): void {
  const row = layout.direction === "row";
  let cross = row ? size.height : size.width;
  if (cross === undefined) {
    cross = 0;
    for (const child of children) cross = Math.max(cross, row ? child.height : child.width);
  }
  let cursor = 0;
  for (const child of children) {
    const free = cross - (row ? child.height : child.width);
    const across = layout.align === "start" ? 0 : layout.align === "center" ? free / 2 : free;
    if (row) {
      child.x += cursor;
      child.y += across;
      cursor += child.width + layout.gap;
    } else {
      child.x += across;
      child.y += cursor;
      cursor += child.height + layout.gap;
    }
  }
}

function placeGrid(
  layout: Extract<ResolvedLayout, { type: "grid" }>,
  children: readonly RenderNode[],
  width: number | undefined,
): void {
  const { columns, gap } = layout;
  let cell = 0;
  if (width === undefined) {
    for (const child of children) cell = Math.max(cell, child.width);
  } else {
    cell = Math.max(0, (width - gap * (columns - 1)) / columns);
  }
  let top = 0;
  for (let start = 0; start < children.length; start += columns) {
    const row = children.slice(start, start + columns);
    let rowHeight = 0;
    row.forEach((child, column) => {
      rowHeight = Math.max(rowHeight, child.height);
      child.x += column * (cell + gap);
      child.y += top;
    });
    top += rowHeight + gap;
  }
}
