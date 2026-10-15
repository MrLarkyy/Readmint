import type { Design } from "./Design.js";
import type { DesignResult } from "./DesignResult.js";

/**
 * The YAML text of a design (`parseDesignAsync` reads it back to an equal design), keys in the design's own order;
 * refused with a `too-large` issue naming both lengths when it exceeds the YAML source limit. The YAML library is
 * loaded on first use, so a bundler can keep it out of the initial chunk.
 */
export async function stringifyDesignYamlAsync(design: Design): Promise<DesignResult<string>> {
  const { stringifyDesignYaml } = await import("./stringifyDesignYaml.js");
  return stringifyDesignYaml(design);
}
