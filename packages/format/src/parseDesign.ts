import type { Design } from "./Design.js";
import type { DesignResult } from "./DesignResult.js";
import { parseDesignSource, type DesignSourceFormat } from "./parseDesignSource.js";
import { validateDesign } from "./validateDesign.js";

export interface ParseDesignOptions {
  /** Defaults to JSON when the first non-whitespace character is `{`, else YAML. */
  readonly format?: DesignSourceFormat;
}

/** Design source text (JSON or YAML) to a validated design at the current format version. */
export function parseDesign(
  source: string,
  options: ParseDesignOptions = {},
): DesignResult<Design> {
  const parsed = parseDesignSource(source, options.format);
  return parsed.ok ? validateDesign(parsed.value) : parsed;
}
