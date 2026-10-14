import { DESIGN_FORMAT_VERSION } from "./designMigrations.js";
import { DesignLimits } from "./DesignLimits.js";
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
  type ObjectNode,
  type SchemaDocument,
  type SchemaNode,
} from "./schema/SchemaNode.js";

const idKey = string("an id (a letter, then letters, digits, _ or -; at most 64)", {
  maxLength: 64,
  pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
});
const coordinate = bindable(number({ minimum: -100_000, maximum: 100_000 }));
const size = bindable(number({ exclusiveMinimum: 0, maximum: 100_000 }));
const length = bindable(number({ minimum: 0, maximum: 100_000 }));
const unit = bindable(number({ minimum: 0, maximum: 1 }));
const strokeWidth = bindable(number({ minimum: 0, maximum: 1000 }));
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
  "fontSize?": bindable(number({ exclusiveMinimum: 0, maximum: 1000 })),
  "fontWeight?": bindable(integer({ minimum: 1, maximum: 1000 })),
  "lineHeight?": bindable(number({ exclusiveMinimum: 0, maximum: 10 })),
  "letterSpacing?": bindable(number({ minimum: -100, maximum: 100 })),
  "align?": enumOf(["start", "middle", "end"]),
};

function layer(type: string, properties: Record<string, SchemaNode>): ObjectNode {
  return object(`a ${type} layer`, {
    type: literal(type),
    "id?": id,
    "name?": string("a name", { maxLength: 128 }),
    "x?": coordinate,
    "y?": coordinate,
    "opacity?": unit,
    "rotation?": bindable(number({ minimum: -360, maximum: 360 })),
    "visible?": bindable(boolean()),
    "style?": id,
    "if?": ref(bindingDef),
    "repeat?": ref("Repeat"),
    ...properties,
  });
}

const shape = { "fill?": paint, "stroke?": paint, "strokeWidth?": strokeWidth };

const scalar = choice(string("a string", { maxLength: 10_000 }), number({}), boolean());

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
        columns: bindable(integer({ minimum: 1, maximum: 1000 })),
        "gap?": length,
      }),
    ]),
  ],
  [
    "Layer",
    union("a layer", [
      layer("group", {
        children: layers,
        "width?": size,
        "height?": size,
        "clip?": bindable(boolean()),
        "layout?": ref("Layout"),
      }),
      layer("rect", { width: size, height: size, "radius?": length, ...shape }),
      layer("ellipse", { width: size, height: size, ...shape }),
      layer("path", {
        d: string("SVG path data (commands, numbers, separators)", {
          minLength: 1,
          maxLength: 100_000,
          pattern: "^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\s-]+$",
        }),
        ...shape,
      }),
      layer("text", {
        content: string("text", { maxLength: 10_000 }),
        "width?": size,
        "fill?": paint,
        ...fontText,
      }),
      layer("image", {
        asset: id,
        width: size,
        height: size,
        "fit?": enumOf(["contain", "cover", "fill"]),
        "alt?": string("alternative text", { maxLength: 500 }),
      }),
      layer("component", {
        ref: id,
        "width?": size,
        "height?": size,
        "props?": record("component props", idKey, scalar),
      }),
    ]),
  ],
  [
    "FontAsset",
    object("a font asset", {
      family: string("a font family", { minLength: 1, maxLength: 128 }),
      src: ref("FontSource"),
      "weight?": integer({ minimum: 1, maximum: 1000 }),
      "style?": enumOf(["normal", "italic"]),
      licence: object("a font licence", {
        embedding: enumOf(["allowed", "restricted"]),
        "name?": string("a licence name", { minLength: 1, maxLength: 128 }),
      }),
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
      "width?": number({ exclusiveMinimum: 0, maximum: 100_000 }),
      "height?": number({ exclusiveMinimum: 0, maximum: 100_000 }),
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
    ),
  ],
  [
    "ComponentDefinition",
    object("a component definition", {
      "description?": string("a description", { maxLength: 2000 }),
      "width?": number({ exclusiveMinimum: 0, maximum: 100_000 }),
      "height?": number({ exclusiveMinimum: 0, maximum: 100_000 }),
      "props?": record("component prop definitions", idKey, ref("ComponentProp")),
      layers,
    }),
  ],
  [
    "ComponentProp",
    object("a component prop definition", {
      type: enumOf(["string", "number", "boolean", "color"]),
      "required?": boolean(),
      "default?": scalar,
    }),
  ],
]);

export const designSchemaV0: SchemaDocument = {
  defs,
  root: object("a design", {
    "$schema?": string("a schema URI", { maxLength: 512 }),
    version: literal(DESIGN_FORMAT_VERSION),
    "title?": string("a title", { maxLength: 200 }),
    "description?": string("a description", { maxLength: 2000 }),
    canvas: object("a canvas", {
      width: bindable(integer({ minimum: 1, maximum: 4096 })),
      height: bindable(integer({ minimum: 1, maximum: 4096 })),
      "background?": paint,
    }),
    layers,
    "styles?": record("styles", idKey, ref("Style")),
    "assets?": object("assets", {
      "fonts?": record("font assets", idKey, ref("FontAsset")),
      "images?": record("image assets", idKey, ref("ImageAsset")),
    }),
    "components?": record("components", idKey, ref("ComponentDefinition")),
  }),
};
