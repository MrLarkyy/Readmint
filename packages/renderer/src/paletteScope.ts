import type { Scope } from "@readmint/expr";
import type { Palette } from "@readmint/format";
import { evaluateBinding } from "./expressions.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo, isBinding } from "./resolveValue.js";
import { rootInstance } from "./rootInstance.js";

/** Modes a `type` issue about the active mode lists. */
const listedModes = 8;

/** The root scope of a render and, when the design has a palette, the mode it resolved to. */
export interface PaletteScope {
  readonly scope: Scope;
  readonly mode?: string;
}

/**
 * The render's root scope with the design's palette: `scope` plus the local `palette`, the tokens of the active mode.
 * A design without a palette gets `scope` itself and no mode, so it evaluates and charges exactly as before. A top-level data key
 * `palette` fails at `/palette`, as a `let` hiding a data key does.
 */
export function paletteScope(context: RenderContext, scope: Scope): PaletteScope {
  const palette: unknown = context.design.palette;
  if (palette === undefined) return { scope };
  if (typeof palette !== "object" || palette === null || Array.isArray(palette)) {
    return context.fail("/palette", "type", `the palette must be an object, got ${echo(palette)}`);
  }
  if (Object.hasOwn(context.data, "palette")) {
    context.fail("/palette", "binding", 'the palette hides the data name "palette"');
  }
  const modes = palette as Palette;
  const mode = activeMode(context, modes, scope);
  const tokens: unknown = ownEntry(modes, mode);
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return context.fail("/palette", "type", "every palette mode must be an object of tokens");
  }
  // A plain copy: the tokens are own data properties (`__proto__` too), whatever object the design holds.
  return { scope: scope.with({ palette: Object.fromEntries(Object.entries(tokens)) }), mode };
}

/**
 * The root instance's `theme` when its component declares that prop: the instance's own value (a binding evaluated
 * in `scope`, the data root, before any `let` or `palette` exists) or else the literal default. Without one, the first
 * mode. Only this prop is resolved this early, so every other prop keeps its evaluation order.
 */
function activeMode(context: RenderContext, palette: Palette, scope: Scope): string {
  const modes = Object.keys(palette);
  const first = modes[0];
  if (first === undefined) return context.fail("/palette", "type", "the palette has no mode");
  const root = rootInstance(context.design);
  const definition = root === undefined ? undefined : ownEntry(root.definition.props, "theme");
  if (root === undefined || definition === undefined) return first;
  const given = ownEntry(root.layer.props, "theme");
  const path =
    given === undefined
      ? pointer(
          pointer(pointer(pointer("/components", root.layer.ref), "props"), "theme"),
          "default",
        )
      : pointer(pointer(pointer("/layers", root.index), "props"), "theme");
  if (given === undefined && definition.default === undefined) return first;
  // A default is literal text, braces included, as `resolveProps` takes it.
  const mode: unknown = isBinding(given)
    ? evaluateBinding(context, given, path, scope)
    : (given ?? definition.default);
  if (typeof mode !== "string" || !Object.hasOwn(palette, mode)) {
    const shown = modes.slice(0, listedModes).map((name) => echo(name));
    const more = modes.length > listedModes ? ", ..." : "";
    context.fail(
      path,
      "type",
      `theme ${echo(mode)} names no palette mode (${shown.join(", ")}${more})`,
    );
  }
  return mode;
}
