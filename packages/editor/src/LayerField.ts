import type { Layer } from "@readmint/format";

/**
 * How a property is edited: `number` takes a number or a `{{binding}}`, `paint` a colour, `none`, a binding or a
 * gradient as JSON, `boolean` true/false or a binding, `text` any string, `choice` one of `options`.
 */
export type LayerFieldKind = "number" | "paint" | "boolean" | "text" | "choice";

export interface LayerField {
  readonly key: string;
  readonly kind: LayerFieldKind;
  /** For `choice`; the empty option (property unset) comes first when the property is optional. */
  readonly options?: readonly string[];
  /** Whether the format requires it: an empty input then does not remove it. */
  readonly required?: boolean;
}

/** Choices that come from the design (its font, image and component ids). */
export interface FieldSources {
  readonly fonts: readonly string[];
  readonly images: readonly string[];
  readonly components: readonly string[];
}

const common: readonly LayerField[] = [
  { key: "id", kind: "text" },
  { key: "name", kind: "text" },
  { key: "x", kind: "number" },
  { key: "y", kind: "number" },
  { key: "rotation", kind: "number" },
  { key: "opacity", kind: "number" },
  { key: "visible", kind: "boolean" },
];

const shape: readonly LayerField[] = [
  { key: "fill", kind: "paint" },
  { key: "stroke", kind: "paint" },
  { key: "strokeWidth", kind: "number" },
];

const size = (required: boolean): LayerField[] => [
  { key: "width", kind: "number", required },
  { key: "height", kind: "number", required },
];

/** The fields the property panel shows for a layer, by type, as `Design.ts` defines them. */
export function layerFields(layer: Layer, sources: FieldSources): LayerField[] {
  switch (layer.type) {
    case "rect":
      return [...common, ...size(true), { key: "radius", kind: "number" }, ...shape];
    case "ellipse":
      return [...common, ...size(true), ...shape];
    case "path":
      return [...common, { key: "d", kind: "text", required: true }, ...shape];
    case "text":
      return [
        ...common,
        { key: "content", kind: "text", required: true },
        { key: "width", kind: "number" },
        { key: "maxLines", kind: "number" },
        { key: "font", kind: "choice", options: sources.fonts },
        { key: "fontSize", kind: "number" },
        { key: "fontWeight", kind: "number" },
        { key: "lineHeight", kind: "number" },
        { key: "letterSpacing", kind: "number" },
        { key: "align", kind: "choice", options: ["start", "middle", "end"] },
        { key: "fill", kind: "paint" },
      ];
    case "image":
      return [
        ...common,
        { key: "asset", kind: "choice", options: sources.images, required: true },
        ...size(true),
        { key: "fit", kind: "choice", options: ["contain", "cover", "fill"] },
        { key: "alt", kind: "text" },
      ];
    case "group":
      return [...common, ...size(false), { key: "clip", kind: "boolean" }];
    case "component":
      return [
        ...common,
        { key: "ref", kind: "choice", options: sources.components, required: true },
        ...size(false),
      ];
  }
}

/** The fields of the canvas, shown when no layer is selected. */
export const canvasFields: readonly LayerField[] = [
  { key: "width", kind: "number", required: true },
  { key: "height", kind: "number", required: true },
  { key: "background", kind: "paint" },
];

const binding = /^\{\{[\s\S]+\}\}$/u;

/** The text an input shows for a property value. */
export function fieldText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * The property value an input's text stands for: `undefined` removes an optional property; an error names what the
 * text should be. The design's validation checks the rest.
 */
export function parseField(
  field: LayerField,
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === "" && field.required !== true && field.kind !== "text")
    return { ok: true, value: undefined };
  if (field.kind === "text") {
    return { ok: true, value: text === "" && field.required !== true ? undefined : text };
  }
  if (field.kind === "choice") return { ok: true, value: trimmed };
  if (binding.test(trimmed)) return { ok: true, value: trimmed };
  switch (field.kind) {
    case "number": {
      const value = Number(trimmed);
      return trimmed !== "" && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, message: `${field.key} must be a number or a {{binding}}` };
    }
    case "boolean":
      if (trimmed === "true" || trimmed === "false") return { ok: true, value: trimmed === "true" };
      return { ok: false, message: `${field.key} must be true, false or a {{binding}}` };
    case "paint":
      if (!trimmed.startsWith("{")) return { ok: true, value: trimmed };
      try {
        return { ok: true, value: JSON.parse(trimmed) as unknown };
      } catch {
        return { ok: false, message: `${field.key} gradient is not valid JSON` };
      }
  }
}
