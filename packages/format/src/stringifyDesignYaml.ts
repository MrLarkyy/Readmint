import { stringify } from "yaml";
import type { Design } from "./Design.js";
import { designFailure } from "./designFailure.js";
import { DesignLimits } from "./DesignLimits.js";
import type { DesignResult } from "./DesignResult.js";

// The reader's own rules (parseYamlText): YAML 1.2 core schema, no merge keys. No anchors, so the text is the tree
// and nothing depends on which objects the design shares; no line folding, so a long string stays one line.
const yamlOptions = {
  version: "1.2",
  schema: "core",
  merge: false,
  aliasDuplicateObjects: false,
  lineWidth: 0,
} as const;

/** The YAML text of a design, keys in the design's own order; refused over the YAML source limit. */
export function stringifyDesignYaml(design: Design): DesignResult<string> {
  const text = stringify(design, yamlOptions);
  if (text.length > DesignLimits.maxYamlSourceLength) {
    return designFailure([
      {
        path: "",
        code: "too-large",
        message: `the design is ${String(text.length)} characters as YAML, more than the ${String(DesignLimits.maxYamlSourceLength)} the YAML reader accepts; export JSON instead`,
      },
    ]) as DesignResult<string>;
  }
  return { ok: true, value: text };
}
