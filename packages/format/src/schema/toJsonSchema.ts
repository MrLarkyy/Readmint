import type { SchemaDocument, SchemaNode } from "./SchemaNode.js";

export type JsonSchema = { readonly [key: string]: unknown };

export interface JsonSchemaHeader {
  readonly id: string;
  readonly title: string;
}

const dialect = "https://json-schema.org/draft/2020-12/schema";

/** Emits JSON Schema 2020-12; key order is fixed by construction, so output is deterministic. */
export function toJsonSchema(schema: SchemaDocument, header: JsonSchemaHeader): JsonSchema {
  const defs: Record<string, JsonSchema> = {};
  for (const [name, node] of schema.defs) defs[name] = emit(node);
  return {
    $schema: dialect,
    $id: header.id,
    title: header.title,
    ...emit(schema.root),
    $defs: defs,
  };
}

function emit(node: SchemaNode): JsonSchema {
  switch (node.kind) {
    case "string":
      if (node.enum !== undefined) return { type: "string", enum: [...node.enum] };
      return {
        type: "string",
        ...(node.minLength > 0 ? { minLength: node.minLength } : {}),
        maxLength: node.maxLength,
        ...(node.pattern === undefined ? {} : { pattern: node.pattern }),
      };
    case "number":
      return {
        type: node.integer ? "integer" : "number",
        ...(node.minimum === undefined ? {} : { minimum: node.minimum }),
        ...(node.exclusiveMinimum === undefined ? {} : { exclusiveMinimum: node.exclusiveMinimum }),
        ...(node.maximum === undefined ? {} : { maximum: node.maximum }),
      };
    case "boolean":
      return { type: "boolean" };
    case "literal":
      return {
        type:
          typeof node.value === "string"
            ? "string"
            : Number.isInteger(node.value)
              ? "integer"
              : "number",
        const: node.value,
      };
    case "object": {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, property] of node.properties) {
        properties[key] = emit(property.node);
        if (property.required) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "array":
      return {
        type: "array",
        items: emit(node.items),
        ...(node.minItems > 0 ? { minItems: node.minItems } : {}),
        ...(node.maxItems === undefined ? {} : { maxItems: node.maxItems }),
      };
    case "record":
      return {
        type: "object",
        propertyNames: emit(node.keys),
        additionalProperties: emit(node.values),
        ...(node.minEntries === undefined ? {} : { minProperties: node.minEntries }),
        ...(node.maxEntries === undefined ? {} : { maxProperties: node.maxEntries }),
      };
    case "union":
      return { type: "object", oneOf: [...node.variants.values()].map(emit) };
    case "choice":
      return { anyOf: node.options.map(emit) };
    case "ref":
      return { $ref: `#/$defs/${node.name}` };
  }
}
