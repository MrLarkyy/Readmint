import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { designSchemaV0 } from "../src/designSchemaV0.js";
import { designJsonSchema, renderManifestJsonSchema } from "../src/index.js";
import { toJsonSchema } from "../src/schema/toJsonSchema.js";

const packageDir = join(import.meta.dirname, "..");
const schemaFile = join(packageDir, "schema", "design-v0.schema.json");
const emitted = `${JSON.stringify(designJsonSchema, null, 2)}\n`;

test("the committed schema file equals the emitted schema byte for byte", () => {
  if (import.meta.env.MODE === "schema-update") {
    if ((process.env["CI"] ?? "") !== "")
      throw new Error("pnpm schema:update is refused when CI is set; update the schema locally");
    writeFileSync(schemaFile, emitted);
  }
  expect(readFileSync(schemaFile, "utf8"), "run pnpm schema:update").toBe(emitted);
});

test("emission is deterministic", () => {
  const header = { id: "x", title: "y" };
  expect(JSON.stringify(toJsonSchema(designSchemaV0, header))).toBe(
    JSON.stringify(toJsonSchema(designSchemaV0, header)),
  );
});

test("the schema names its version, dialect and location", () => {
  const properties = designJsonSchema["properties"] as Record<string, Record<string, unknown>>;
  expect(properties["version"]?.["const"]).toBe(0);
  expect(designJsonSchema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(designJsonSchema["$id"]).toMatch(/\/packages\/format\/schema\/design-v0\.schema\.json$/u);
  expect(designJsonSchema["additionalProperties"]).toBe(false);
});

test("the exported schema object cannot be changed by a consumer", () => {
  expect(Object.isFrozen(designJsonSchema)).toBe(true);
  expect(Object.isFrozen(designJsonSchema["$defs"])).toBe(true);
});

test("the package exports the schema file", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  const target = manifest.exports["./schema/design-v0.schema.json"];
  expect(target).toBe("./schema/design-v0.schema.json");
  expect(existsSync(join(packageDir, String(target)))).toBe(true);
});

const rendersFile = join(packageDir, "schema", "renders-v0.schema.json");
const rendersEmitted = `${JSON.stringify(renderManifestJsonSchema, null, 2)}
`;

test("the committed render manifest schema equals the emitted schema byte for byte", () => {
  if (import.meta.env.MODE === "schema-update") {
    if ((process.env["CI"] ?? "") !== "")
      throw new Error("pnpm schema:update is refused when CI is set; update the schema locally");
    writeFileSync(rendersFile, rendersEmitted);
  }
  expect(readFileSync(rendersFile, "utf8"), "run pnpm schema:update").toBe(rendersEmitted);
});

test("the package exports the render manifest schema file, and the schema object is frozen", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  expect(manifest.exports["./schema/renders-v0.schema.json"]).toBe(
    "./schema/renders-v0.schema.json",
  );
  expect(Object.isFrozen(renderManifestJsonSchema)).toBe(true);
  expect(Object.isFrozen(renderManifestJsonSchema["properties"])).toBe(true);
});
