import { ValueRanges, type GradientStop } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { formatNumber } from "./formatNumber.js";
import { parseColour, type PaintColour } from "./parseColour.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { evaluateBinding } from "./expressions.js";
import { echo, isBinding, resolveColour, resolveNumber } from "./resolveValue.js";
import type { SvgWriter } from "./SvgWriter.js";

export interface PaintStop {
  readonly offset: number;
  readonly colour: PaintColour;
}

/** A paint with every binding evaluated; gradient coordinates are fractions of the painted box. */
export type Paint =
  | { readonly kind: "none" }
  | { readonly kind: "colour"; readonly colour: PaintColour }
  | {
      readonly kind: "linear";
      readonly coordinates: readonly [x1: number, y1: number, x2: number, y2: number];
      readonly stops: readonly PaintStop[];
    }
  | {
      readonly kind: "radial";
      readonly coordinates: readonly [cx: number, cy: number, r: number];
      readonly stops: readonly PaintStop[];
    };

/** A colour, `"none"`, a binding giving either, or a gradient; undefined stays undefined (SVG default paint). */
export function resolvePaint(
  context: RenderContext,
  value: unknown,
  path: string,
  scope: Scope,
): Paint | undefined {
  if (value === undefined) return undefined;
  const actual = isBinding(value) ? evaluateBinding(context, value, path, scope) : value;
  if (actual === "none") return { kind: "none" };
  if (typeof actual === "string") {
    const colour = parseColour(actual);
    if (colour !== undefined) return { kind: "colour", colour };
  }
  if (
    !isBinding(value) &&
    typeof actual === "object" &&
    actual !== null &&
    !Array.isArray(actual)
  ) {
    const gradient = actual as Readonly<Record<string, unknown>>;
    if (gradient["type"] === "linear" || gradient["type"] === "radial") {
      return resolveGradient(context, gradient, path, scope);
    }
  }
  return context.fail(path, "type", `expected a colour, "none" or a gradient, got ${echo(actual)}`);
}

function resolveGradient(
  context: RenderContext,
  gradient: Readonly<Record<string, unknown>>,
  path: string,
  scope: Scope,
): Paint {
  const coordinate = (key: string, fallback: number) => {
    const value = gradient[key];
    return value === undefined
      ? fallback
      : resolveNumber(context, value, pointer(path, key), ValueRanges.unit, scope);
  };
  const stopsPath = pointer(path, "stops");
  const stopList = gradient["stops"];
  if (!Array.isArray(stopList) || stopList.length < 2) {
    context.fail(stopsPath, "type", "a gradient needs at least two stops");
  }
  const stops = (stopList as readonly GradientStop[]).map((stop, index) => {
    const stopPath = pointer(stopsPath, index);
    return {
      offset: resolveNumber(
        context,
        stop.offset,
        pointer(stopPath, "offset"),
        ValueRanges.unit,
        scope,
      ),
      colour: resolveColour(context, stop.color, pointer(stopPath, "color"), scope),
    };
  });
  if (gradient["type"] === "linear") {
    return {
      kind: "linear",
      coordinates: [
        coordinate("x1", 0),
        coordinate("y1", 0),
        coordinate("x2", 1),
        coordinate("y2", 0),
      ],
      stops,
    };
  }
  return {
    kind: "radial",
    coordinates: [coordinate("cx", 0.5), coordinate("cy", 0.5), coordinate("r", 0.5)],
    stops,
  };
}

/**
 * ` fill="..."` (or stroke) plus `fill-opacity` when the colour has alpha; a gradient is written into `<defs>`
 * under the next `g<n>` id. Empty when the paint is undefined.
 */
export function paintAttributes(
  writer: SvgWriter,
  attribute: "fill" | "stroke",
  paint: Paint | undefined,
): string {
  if (paint === undefined) return "";
  switch (paint.kind) {
    case "none":
      return ` ${attribute}="none"`;
    case "colour":
      return ` ${attribute}="${paint.colour.hex}"${alpha(`${attribute}-opacity`, paint.colour)}`;
    case "linear":
    case "radial":
      return ` ${attribute}="url(#${defineGradient(writer, paint)})"`;
  }
}

function defineGradient(
  writer: SvgWriter,
  paint: Extract<Paint, { kind: "linear" | "radial" }>,
): string {
  const id = writer.id("g");
  const names = paint.kind === "linear" ? ["x1", "y1", "x2", "y2"] : ["cx", "cy", "r"];
  const coordinates = names
    .map((name, index) => ` ${name}="${formatNumber(paint.coordinates[index] ?? 0)}"`)
    .join("");
  const stops = paint.stops
    .map(
      (stop) =>
        `<stop offset="${formatNumber(stop.offset)}" stop-color="${stop.colour.hex}"${alpha("stop-opacity", stop.colour)}/>`,
    )
    .join("");
  const element = paint.kind === "linear" ? "linearGradient" : "radialGradient";
  writer.define(`<${element} id="${id}"${coordinates}>${stops}</${element}>`);
  return id;
}

function alpha(attribute: string, colour: PaintColour): string {
  return colour.alpha === 1 ? "" : ` ${attribute}="${formatNumber(colour.alpha)}"`;
}
