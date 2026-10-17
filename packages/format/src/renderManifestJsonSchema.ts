import { RenderManifestLimits } from "./RenderManifestLimits.js";
import { renderVariants } from "./RenderVariant.js";
import type { JsonSchema } from "./schema/toJsonSchema.js";

const scalar = { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] };

/**
 * The published JSON Schema of the render manifest (`schema/renders-v0.schema.json`). It states the shape and the
 * limits; the rules a schema cannot say (a name unique ignoring letter case, no Windows device name, a variant prop
 * set twice) are the parser's.
 */
export const renderManifestJsonSchema: JsonSchema = deepFreeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://raw.githubusercontent.com/MrLarkyy/Readmint/main/packages/format/schema/renders-v0.schema.json",
  title: "Readmint render manifest v0",
  type: "object",
  properties: {
    $schema: { type: "string", maxLength: 512 },
    renders: {
      type: "array",
      minItems: 1,
      maxItems: RenderManifestLimits.maxRenders,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
          },
          design: {
            type: "string",
            minLength: 1,
            maxLength: RenderManifestLimits.maxDesignLength,
            pattern:
              '^(?![A-Za-z]:)[^/\\u005c:*?"<>|\\u0000-\\u001f][^\\u005c:*?"<>|\\u0000-\\u001f]*[.](?:[Jj][Ss][Oo][Nn]|[Yy][Aa]?[Mm][Ll])$',
          },
          props: {
            type: "object",
            maxProperties: RenderManifestLimits.maxPropsPerRender,
            propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
            additionalProperties: { anyOf: [scalar, { type: "array", items: scalar }] },
          },
          variants: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", enum: renderVariants.map((variant) => variant.name) },
          },
        },
        required: ["name", "design"],
        additionalProperties: false,
      },
    },
  },
  required: ["renders"],
  additionalProperties: false,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
