import { designSchemaV0 } from "./designSchemaV0.js";
import { toJsonSchema, type JsonSchema } from "./schema/toJsonSchema.js";

/** The published JSON Schema of the current format version (`schema/design-v0.schema.json`). */
export const designJsonSchema: JsonSchema = deepFreeze(
  toJsonSchema(designSchemaV0, {
    id: "https://raw.githubusercontent.com/MrLarkyy/Readmint/main/packages/format/schema/design-v0.schema.json",
    title: "Readmint design format v0",
  }),
);

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
