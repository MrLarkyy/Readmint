import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { parseRenderManifest, renderManifestJsonSchema } from "../src/index.js";

const committed = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "schema", "renders-v0.schema.json"), "utf8"),
) as object;

const validators = {
  emitted: new Ajv2020({ strict: true }).compile(renderManifestJsonSchema),
  committed: new Ajv2020({ strict: true }).compile(committed),
};

const entry = { name: "a", design: "a.json" };
const valid: Record<string, unknown> = {
  minimal: { renders: [entry] },
  "with schema": { $schema: "https://example.test/x.json", renders: [entry] },
  props: { renders: [{ ...entry, props: { slot: 3, tags: ["a", 1, true] } }] },
  variants: { renders: [{ ...entry, variants: ["dark"] }] },
  "no variants": { renders: [{ ...entry, variants: [] }] },
  "sub folder": { renders: [{ name: "b", design: "sub/dir/b.YAML" }] },
};
// The shape-invalid fixtures: the parser refuses each of them too.
const invalid: Record<string, unknown> = {
  "no renders": {},
  "empty renders": { renders: [] },
  "unknown root key": { renders: [entry], version: 1 },
  "unknown entry key": { renders: [{ ...entry, extra: 1 }] },
  "no name": { renders: [{ design: "a.json" }] },
  "bad name": { renders: [{ name: "1a", design: "a.json" }] },
  "no design": { renders: [{ name: "a" }] },
  "absolute design": { renders: [{ name: "a", design: "/a.json" }] },
  "drive design": { renders: [{ name: "a", design: "C:/a.json" }] },
  "backslash design": { renders: [{ name: "a", design: "a\\b.json" }] },
  "design extension": { renders: [{ name: "a", design: "a.txt" }] },
  "object prop": { renders: [{ ...entry, props: { p: { q: 1 } } }] },
  "null prop": { renders: [{ ...entry, props: { p: null } }] },
  "bad prop key": { renders: [{ ...entry, props: { "1p": 1 } }] },
  "unknown variant": { renders: [{ ...entry, variants: ["night"] }] },
  "repeated variant": { renders: [{ ...entry, variants: ["dark", "dark"] }] },
  "too many renders": {
    renders: Array.from({ length: 65 }, (_, index) => ({ ...entry, name: `r${String(index)}` })),
  },
};

describe.each(Object.entries(validators))(
  "ajv 2020 strict with the %s schema",
  (_name, validate) => {
    test.each(Object.entries(valid))("accepts %s, as the parser does", (_label, value) => {
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      expect(parseRenderManifest(JSON.stringify(value)).ok).toBe(true);
    });

    test.each(Object.entries(invalid))("rejects %s, as the parser does", (_label, value) => {
      expect(validate(value)).toBe(false);
      expect(parseRenderManifest(JSON.stringify(value)).ok).toBe(false);
    });
  },
);
