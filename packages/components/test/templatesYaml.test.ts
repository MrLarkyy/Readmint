import { parseDesignAsync, stringifyDesignYamlAsync } from "@readmint/format";
import { expect, test } from "vitest";
import { starterTemplates } from "../src/index.js";
import { loadStarter } from "./templateDesigns.js";

test.each(starterTemplates)(
  "the starter %s re-imports from its YAML export to a deep-equal design",
  async (name) => {
    const design = loadStarter(name);
    const yaml = await stringifyDesignYamlAsync(design);
    if (!yaml.ok) throw new Error(JSON.stringify(yaml.issues));
    expect(await parseDesignAsync(yaml.value, { format: "yaml" })).toEqual({
      ok: true,
      value: design,
    });
  },
);
