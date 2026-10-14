import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { designJsonSchema } from "../src/index.js";
import { parseDesignSource } from "../src/parseDesignSource.js";
import { loadFixtures, type Fixture } from "./loadFixtures.js";

const committed = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "schema", "design-v0.schema.json"), "utf8"),
) as object;

const validators = {
  emitted: new Ajv2020({ strict: true }).compile(designJsonSchema),
  committed: new Ajv2020({ strict: true }).compile(committed),
};

function valueOf(fixture: Fixture): unknown {
  const parsed = parseDesignSource(fixture.source, fixture.format);
  if (!parsed.ok) throw new Error(`${fixture.file} does not parse`);
  return parsed.value;
}

describe.each(Object.entries(validators))(
  "ajv 2020 strict with the %s schema",
  (_name, validate) => {
    test.each(loadFixtures("valid").map((fixture) => [fixture.file, fixture] as const))(
      "accepts valid %s",
      (_file, fixture) => {
        expect(validate(valueOf(fixture)), JSON.stringify(validate.errors)).toBe(true);
      },
    );

    test.each(loadFixtures("invalid").map((fixture) => [fixture.file, fixture] as const))(
      "agrees on invalid %s",
      (_file, fixture) => {
        // semantic- fixtures break only reference rules JSON Schema cannot express.
        expect(validate(valueOf(fixture))).toBe(fixture.name.startsWith("semantic-"));
      },
    );
  },
);
