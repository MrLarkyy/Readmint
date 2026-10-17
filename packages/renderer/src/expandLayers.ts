import {
  ValueRanges,
  type ComponentLayer,
  type GroupLayer,
  type Layer,
  type LayerType,
  type Layout,
} from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { evaluateIf, letScope, repeatScopes } from "./expressions.js";
import { placeChildren, type ResolvedLayout } from "./layout.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { GroupNode, RenderNode } from "./RenderNode.js";
import { resolveAnimation } from "./resolveAnimation.js";
import { resolveBase } from "./resolveBase.js";
import { resolveImage } from "./resolveImage.js";
import { resolveOrbit } from "./resolveOrbit.js";
import { resolveProps } from "./resolveProps.js";
import { resolveEllipse, resolvePath, resolveRect } from "./resolveShape.js";
import { resolveText } from "./resolveText.js";
import { echo, resolveBoolean, resolveOptionalNumber } from "./resolveValue.js";

/**
 * The least markup each kind of node produces without its variable parts (`<g></g>`, a `<rect>` with its four
 * numbers, `<path d=""/>`, the `<use>` of an image drawn more than once, ...); reserved per node against the output budget, so a huge expansion stops long before
 * it is built. A path also reserves its data and a text its filled-in content.
 */
export const minimumNodeBytes: Readonly<Record<LayerType, number>> = {
  group: 7,
  component: 7,
  rect: 40,
  ellipse: 37,
  path: 12,
  text: 60,
  image: 56,
};

/** Component instances inside component instances; validated designs have no cycles, this bounds the rest. */
export const maxComponentDepth = 64;

/**
 * Turns layers into render nodes in document order: a `repeat` gives one copy per item (scope: `as`, default
 * `item`, and `index`, default `index`); then each copy binds its `let` names in order; then `visible` false or a falsy
 * `if` drops a copy; a component instance becomes a group of its definition's layers, evaluated with `props` in scope.
 */
export function expandLayers(
  context: RenderContext,
  layers: readonly Layer[],
  basePath: string,
  scope: Scope,
): RenderNode[] {
  const nodes: RenderNode[] = [];
  layers.forEach((layer, index) => {
    expandLayer(context, layer, pointer(basePath, index), scope, nodes);
  });
  return nodes;
}

function expandLayer(
  context: RenderContext,
  layer: Layer,
  path: string,
  scope: Scope,
  out: RenderNode[],
): void {
  const repeat = layer.repeat;
  if (repeat === undefined) {
    addLayer(context, layer, path, scope, 0, out);
    return;
  }
  const copies = repeatScopes(context, repeat, path, scope);
  // Charged before any copy is expanded, so copies an `if` or `visible` drops count as well.
  context.countRepeatCopies(pointer(path, "repeat"), copies.length);
  copies.forEach((copy, index) => {
    context.within(`repeat item ${String(index)}`, () => {
      addLayer(context, layer, path, copy, index, out);
    });
  });
}

/** `copy` is the index of the layer's own repeat copy (0 without a repeat), the step of an animation's stagger. */
function addLayer(
  context: RenderContext,
  layer: Layer,
  path: string,
  outer: Scope,
  copy: number,
  out: RenderNode[],
): void {
  const local = localScope(context, layer, path, outer);
  if (
    layer.visible !== undefined &&
    !resolveBoolean(context, layer.visible, pointer(path, "visible"), local)
  ) {
    return;
  }
  if (layer.if !== undefined && !evaluateIf(context, layer.if, pointer(path, "if"), local)) {
    return;
  }
  context.writer.reserve(minimumNodeBytes[layer.type]);
  const node = resolveLayer(context, layer, path, local);
  const animation = resolveAnimation(context, layer, node, path, local, copy);
  const placed = resolveOrbit(context, layer, node, animation, path, local);
  if (placed === undefined) out.push(animation === undefined ? node : { ...node, animation });
  else {
    const { orbit, opacity, animation: played } = placed;
    out.push({ ...node, orbit, opacity, ...(played === undefined ? {} : { animation: played }) });
  }
}

/** The layer's scope with its `let` names; the root instance's was built for the canvas already and is reused. */
function localScope(context: RenderContext, layer: Layer, path: string, scope: Scope): Scope {
  if (layer.let === undefined) return scope;
  const root = context.rootProps;
  if (root?.scope !== undefined && root.path === path && context.componentDepth === 0) {
    return root.scope;
  }
  return letScope(context, layer.let, path, scope);
}

function resolveLayer(
  context: RenderContext,
  layer: Layer,
  path: string,
  scope: Scope,
): RenderNode {
  switch (layer.type) {
    case "group":
      return resolveGroup(context, layer, path, scope);
    case "component":
      return resolveComponent(context, layer, path, scope);
    case "rect":
      return resolveRect(context, layer, path, scope);
    case "ellipse":
      return resolveEllipse(context, layer, path, scope);
    case "path":
      return resolvePath(context, layer, path, scope);
    case "text":
      return resolveText(context, layer, path, scope);
    case "image":
      return resolveImage(context, layer, path, scope);
  }
}

function resolveGroup(
  context: RenderContext,
  layer: GroupLayer,
  path: string,
  scope: Scope,
): GroupNode {
  const base = resolveBase(context, layer, path, scope);
  const width = resolveOptionalNumber(
    context,
    layer.width,
    pointer(path, "width"),
    ValueRanges.size,
    scope,
  );
  const height = resolveOptionalNumber(
    context,
    layer.height,
    pointer(path, "height"),
    ValueRanges.size,
    scope,
  );
  const clip =
    layer.clip === undefined
      ? false
      : resolveBoolean(context, layer.clip, pointer(path, "clip"), scope);
  const layout = resolveLayout(context, layer.layout, pointer(path, "layout"), scope);
  const children = expandLayers(context, layer.children, pointer(path, "children"), scope);
  const orbiting = layout.type === "absolute" ? undefined : children.find((child) => child.orbit);
  if (orbiting !== undefined) {
    context.fail(
      pointer(orbiting.path, "orbit"),
      "type",
      "an orbit places its layer itself, so the layer cannot be in a stack or grid group",
    );
  }
  const content = placeChildren(layout, children, { width, height });
  return {
    kind: "group",
    ...base,
    width: width ?? content.width,
    height: height ?? content.height,
    children,
    clip,
  };
}

function resolveLayout(
  context: RenderContext,
  layout: Layout | undefined,
  path: string,
  scope: Scope,
): ResolvedLayout {
  if (layout === undefined || layout.type === "absolute") return { type: "absolute" };
  const gap =
    resolveOptionalNumber(context, layout.gap, pointer(path, "gap"), ValueRanges.length, scope) ??
    0;
  if (layout.type === "stack") {
    return { type: "stack", direction: layout.direction, gap, align: layout.align ?? "start" };
  }
  const columns = resolveOptionalNumber(
    context,
    layout.columns,
    pointer(path, "columns"),
    ValueRanges.columns,
    scope,
  );
  return { type: "grid", columns: columns ?? 1, gap };
}

function resolveComponent(
  context: RenderContext,
  layer: ComponentLayer,
  path: string,
  scope: Scope,
): GroupNode {
  const base = resolveBase(context, layer, path, scope);
  const definition = ownEntry(context.design.components, layer.ref);
  if (definition === undefined) {
    context.fail(pointer(path, "ref"), "type", `no component ${echo(layer.ref)}`);
  }
  if (context.componentDepth >= maxComponentDepth) {
    context.fail(
      path,
      "too-large",
      `components nest deeper than ${String(maxComponentDepth)} levels`,
    );
  }
  const width = resolveOptionalNumber(
    context,
    layer.width,
    pointer(path, "width"),
    ValueRanges.size,
    scope,
  );
  const height = resolveOptionalNumber(
    context,
    layer.height,
    pointer(path, "height"),
    ValueRanges.size,
    scope,
  );
  // The root instance's props may have been resolved for the canvas already: reused, never evaluated twice.
  const root = context.rootProps;
  const props =
    root !== undefined && root.path === path && context.componentDepth === 0
      ? root.props
      : resolveProps(context, layer, definition.props ?? {}, path, scope);
  const definitionPath = pointer(pointer("/components", layer.ref), "layers");
  const inner = propsScope(context, scope, props, path);
  const children = context.within(`in component instance ${path}`, () =>
    context.nested(() => expandLayers(context, definition.layers, definitionPath, inner)),
  );
  const content = placeChildren({ type: "absolute" }, children, { width, height });
  return {
    kind: "group",
    ...base,
    width: width ?? definition.width ?? content.width,
    height: height ?? definition.height ?? content.height,
    children,
    clip: false,
  };
}

/**
 * The scope of a component's layers: `scope` plus `props`. The copy of the locals is charged to the budget (one step per
 * local and one for `props`), as a repeat copy and a `let` are, so instances under large lets stay bounded.
 */
function propsScope(
  context: RenderContext,
  scope: Scope,
  props: Readonly<Record<string, unknown>>,
  path: string,
): Scope {
  const budget = scope.budget;
  if (budget !== undefined && !budget.charge(scope.localCount + 1)) {
    const limit = String(budget.maxSteps);
    context.fail(
      path,
      "binding",
      `component props: evaluation exceeded its budget of ${limit} steps (budget)`,
    );
  }
  return scope.with({ props });
}
