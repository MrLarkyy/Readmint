import { DESIGN_FORMAT_VERSION } from "./designMigrations.js";
import { designLocales } from "./designLocales.js";
import { DesignLimits } from "./DesignLimits.js";
import { PathData } from "./PathData.js";
import { ValueRanges, type ValueRange } from "./ValueRanges.js";
import {
  array,
  bindable,
  bindingDef,
  boolean,
  choice,
  enumOf,
  integer,
  literal,
  number,
  object,
  record,
  ref,
  string,
  union,
  type NumberNode,
  type ObjectNode,
  type SchemaDocument,
  type SchemaNode,
} from "./schema/SchemaNode.js";

const idKey = string("an id (a letter, then letters, digits, _ or -; at most 64)", {
  maxLength: 64,
  pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
});
function numberIn({ integer: whole, ...bounds }: ValueRange): NumberNode {
  return whole ? integer(bounds) : number(bounds);
}

const coordinate = bindable(numberIn(ValueRanges.position));
const size = bindable(numberIn(ValueRanges.size));
const length = bindable(numberIn(ValueRanges.length));
const unit = bindable(numberIn(ValueRanges.unit));
const strokeWidth = bindable(numberIn(ValueRanges.strokeWidth));
const id = ref("Id");
const paint = ref("Paint");
const layers = array("a list of layers", ref("Layer"));

/** Case-insensitive file extensions, spelled out because the JSON Schema dialect has no flags. */
function extensions(names: readonly string[]): string {
  return names
    .map((name) => name.replace(/[a-z]/gu, (char) => `[${char}${char.toUpperCase()}]`))
    .join("|");
}

/**
 * No scheme, no leading slash, no backslash, no `..` segment and no `%` (so no URL-encoded `..`
 * either); the extension names the kind.
 */
function relativePath(names: readonly string[]): string {
  return `^(?!/)(?!(?:[\\s\\S]*/)?\\.\\.(?:/|$))[^\\\\:\\u0000-\\u001f\\u007f?#%]+\\.(?:${extensions(names)})$`;
}

function dataUri(mediaTypes: string): string {
  return `^data:${mediaTypes};base64,[A-Za-z0-9+/]+={0,2}$`;
}

const fontText = {
  "font?": id,
  "fontSize?": bindable(numberIn(ValueRanges.fontSize)),
  "fontWeight?": bindable(numberIn(ValueRanges.fontWeight)),
  "lineHeight?": bindable(numberIn(ValueRanges.lineHeight)),
  "letterSpacing?": bindable(numberIn(ValueRanges.letterSpacing)),
  "align?": enumOf(["start", "middle", "end"]),
};

const easing = ref("Easing");

/** Keyframes with `value` (literal or bound) and the literal offsets and easings the format can check statically. */
function track(label: string, value: SchemaNode): ObjectNode {
  return object(`${label} track`, {
    keyframes: array(
      "a list of keyframes",
      object("a keyframe", { offset: numberIn(ValueRanges.unit), value, "easing?": easing }),
      { minItems: 2, maxItems: 32 },
    ),
    "duration?": bindable(numberIn(ValueRanges.animationDuration)),
    "delay?": bindable(numberIn(ValueRanges.animationTime)),
    "stagger?": bindable(numberIn(ValueRanges.animationTime)),
    "easing?": easing,
  });
}

const layerTracks = {
  "opacity?": ref("UnitTrack"),
  "x?": ref("PositionTrack"),
  "y?": ref("PositionTrack"),
  "scale?": ref("ScaleTrack"),
  "rotation?": ref("RotationTrack"),
};
const shapeTracks = { ...layerTracks, "fill?": ref("ColourTrack"), "stroke?": ref("ColourTrack") };

function layer(
  type: string,
  animation: string,
  properties: Record<string, SchemaNode>,
): ObjectNode {
  return object(`a ${type} layer`, {
    type: literal(type),
    "id?": id,
    "name?": string("a name", { maxLength: 128 }),
    "x?": coordinate,
    "y?": coordinate,
    "opacity?": unit,
    "rotation?": bindable(numberIn(ValueRanges.rotation)),
    "visible?": bindable(boolean()),
    "style?": id,
    "if?": ref(bindingDef),
    "repeat?": ref("Repeat"),
    "animate?": ref(animation),
    ...properties,
  });
}

const shape = { "fill?": paint, "stroke?": paint, "strokeWidth?": strokeWidth };

const scalar = choice(string("a string", { maxLength: 10_000 }), number({}), boolean());
const propList = array("a list of prop values", scalar, { maxItems: 1000 });
const propValue = choice(
  string("a string", { maxLength: 10_000 }),
  number({}),
  boolean(),
  propList,
);

function scalarProp(type: string): ObjectNode {
  return object(`a ${type} prop definition`, {
    type: literal(type),
    "required?": boolean(),
    "default?": scalar,
  });
}

function gradient(type: string, properties: Record<string, SchemaNode>): ObjectNode {
  return object(`a ${type} gradient`, {
    type: literal(type),
    ...properties,
    stops: array("a list of gradient stops", ref("GradientStop"), { minItems: 2, maxItems: 32 }),
  });
}

const defs = new Map<string, SchemaNode>([
  [bindingDef, string("a {{binding}}", { maxLength: 2048, pattern: "^\\{\\{[\\s\\S]+\\}\\}$" })],
  ["Id", idKey],
  [
    "Colour",
    string("a colour (#rgb, #rgba, #rrggbb or #rrggbbaa)", {
      maxLength: 9,
      pattern: "^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
    }),
  ],
  ["Paint", choice(ref("Colour"), literal("none"), ref(bindingDef), ref("Gradient"))],
  [
    "Gradient",
    union("a gradient", [
      gradient("linear", { "x1?": unit, "y1?": unit, "x2?": unit, "y2?": unit }),
      gradient("radial", { "cx?": unit, "cy?": unit, "r?": unit }),
    ]),
  ],
  ["GradientStop", object("a gradient stop", { offset: unit, color: bindable(ref("Colour")) })],
  [
    "Style",
    object("a style", {
      "fill?": paint,
      "stroke?": paint,
      "strokeWidth?": strokeWidth,
      "opacity?": unit,
      ...fontText,
    }),
  ],
  ["Repeat", object("a repeat", { each: ref(bindingDef), "as?": id, "index?": id })],
  [
    "Layout",
    union("a layout", [
      object("an absolute layout", { type: literal("absolute") }),
      object("a stack layout", {
        type: literal("stack"),
        direction: enumOf(["row", "column"]),
        "gap?": length,
        "align?": enumOf(["start", "center", "end"]),
      }),
      object("a grid layout", {
        type: literal("grid"),
        columns: bindable(numberIn(ValueRanges.columns)),
        "gap?": length,
      }),
    ]),
  ],
  [
    "Layer",
    union("a layer", [
      layer("group", "LayerAnimation", {
        children: layers,
        "width?": size,
        "height?": size,
        "clip?": bindable(boolean()),
        "layout?": ref("Layout"),
      }),
      layer("rect", "ShapeAnimation", { width: size, height: size, "radius?": length, ...shape }),
      layer("ellipse", "ShapeAnimation", { width: size, height: size, ...shape }),
      layer("path", "PathAnimation", {
        d: choice(
          string("SVG path data (commands, numbers, separators)", {
            minLength: 1,
            maxLength: PathData.maxLength,
            pattern: PathData.pattern,
          }),
          string("path data with {{ }} placeholders", {
            minLength: 5,
            maxLength: PathData.maxTemplateLength,
            pattern: PathData.templatePattern,
          }),
        ),
        ...shape,
      }),
      layer("text", "TextAnimation", {
        content: string("text", { maxLength: 10_000 }),
        "width?": size,
        "fill?": paint,
        ...fontText,
      }),
      layer("image", "LayerAnimation", {
        asset: id,
        width: size,
        height: size,
        "fit?": enumOf(["contain", "cover", "fill"]),
        "alt?": string("alternative text", { maxLength: 500 }),
      }),
      layer("component", "LayerAnimation", {
        ref: id,
        "width?": size,
        "height?": size,
        "props?": record("component props", idKey, propValue),
      }),
    ]),
  ],
  [
    "Easing",
    choice(
      enumOf(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]),
      object("a cubic-bezier easing", {
        x1: numberIn(ValueRanges.unit),
        y1: numberIn(ValueRanges.easingY),
        x2: numberIn(ValueRanges.unit),
        y2: numberIn(ValueRanges.easingY),
      }),
    ),
  ],
  ["UnitTrack", track("a unit", unit)],
  ["PositionTrack", track("a position", coordinate)],
  ["ScaleTrack", track("a scale", bindable(numberIn(ValueRanges.scale)))],
  ["RotationTrack", track("a rotation", bindable(numberIn(ValueRanges.rotation)))],
  ["ColourTrack", track("a colour", bindable(ref("Colour")))],
  ["LayerAnimation", object("a layer animation", layerTracks)],
  ["ShapeAnimation", object("a shape animation", shapeTracks)],
  ["PathAnimation", object("a path animation", { ...shapeTracks, "draw?": ref("UnitTrack") })],
  ["TextAnimation", object("a text animation", { ...layerTracks, "fill?": ref("ColourTrack") })],
  [
    "Animation",
    object("an animation timeline", {
      duration: numberIn(ValueRanges.animationDuration),
      "loop?": boolean(),
    }),
  ],
  [
    "FontAsset",
    object("a font asset", {
      family: string("a font family", { minLength: 1, maxLength: 128 }),
      src: ref("FontSource"),
      "weight?": numberIn(ValueRanges.fontWeight),
      "style?": enumOf(["normal", "italic"]),
      licence: object("a font licence", {
        embedding: enumOf(["allowed", "restricted"]),
        "name?": string("a licence name", { minLength: 1, maxLength: 128 }),
        "reservedFontName?": boolean(),
      }),
      "drawAs?": enumOf(["font", "paths"]),
      "fallback?": array("a list of fallback font ids", id, { minItems: 1, maxItems: 8 }),
      "kerning?": boolean(),
    }),
  ],
  [
    "FontSource",
    choice(
      string("a relative .ttf, .otf, .woff or .woff2 path without .. segments", {
        maxLength: 1024,
        pattern: relativePath(["ttf", "otf", "woff", "woff2"]),
      }),
      string("a base64 font/ttf, font/otf, font/woff or font/woff2 data URI", {
        maxLength: DesignLimits.maxSourceLength,
        pattern: dataUri("font/(?:ttf|otf|woff|woff2)"),
      }),
    ),
  ],
  [
    "ImageAsset",
    object("an image asset", {
      src: ref("ImageSource"),
      "width?": numberIn(ValueRanges.size),
      "height?": numberIn(ValueRanges.size),
    }),
  ],
  [
    "ImageSource",
    choice(
      string("a relative .png, .jpg, .jpeg, .gif or .webp path without .. segments", {
        maxLength: 1024,
        pattern: relativePath(["png", "jpg", "jpeg", "gif", "webp"]),
      }),
      string("a base64 image/png, image/jpeg, image/gif or image/webp data URI", {
        maxLength: DesignLimits.maxSourceLength,
        pattern: dataUri("image/(?:png|jpeg|gif|webp)"),
      }),
      ref(bindingDef),
    ),
  ],
  [
    "ComponentDefinition",
    object("a component definition", {
      "description?": string("a description", { maxLength: 2000 }),
      "width?": numberIn(ValueRanges.size),
      "height?": numberIn(ValueRanges.size),
      "props?": record("component prop definitions", idKey, ref("ComponentProp")),
      layers,
    }),
  ],
  [
    "ComponentProp",
    union("a component prop definition", [
      ...["string", "number", "boolean", "color"].map(scalarProp),
      object("an enum prop definition", {
        type: literal("enum"),
        values: array(
          "a list of allowed values",
          string("an allowed value", { minLength: 1, maxLength: 128 }),
          {
            minItems: 1,
            maxItems: 64,
          },
        ),
        "required?": boolean(),
        "default?": string("an allowed value", { maxLength: 128 }),
      }),
      object("an array prop definition", {
        type: literal("array"),
        "required?": boolean(),
        "default?": propList,
      }),
    ]),
  ],
]);

export const designSchemaV0: SchemaDocument = {
  defs,
  root: object("a design", {
    "$schema?": string("a schema URI", { maxLength: 512 }),
    version: literal(DESIGN_FORMAT_VERSION),
    "title?": string("a title", { maxLength: 200 }),
    "description?": string("a description", { maxLength: 2000 }),
    "locale?": enumOf(designLocales),
    canvas: object("a canvas", {
      width: bindable(numberIn(ValueRanges.canvasSide)),
      height: bindable(numberIn(ValueRanges.canvasSide)),
      "background?": paint,
    }),
    layers,
    "styles?": record("styles", idKey, ref("Style")),
    "assets?": object("assets", {
      "fonts?": record("font assets", idKey, ref("FontAsset")),
      "images?": record("image assets", idKey, ref("ImageAsset")),
    }),
    "components?": record("components", idKey, ref("ComponentDefinition")),
    "animation?": ref("Animation"),
  }),
};
