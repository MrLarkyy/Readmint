import {
  parseDesignAsync,
  type Design,
  type DesignResult,
  type ParseDesignOptions,
} from "@readmint/format";

/** Design source text (JSON or YAML) to a validated design; the YAML parser loads only for YAML. */
export function importDesign(
  source: string,
  options: ParseDesignOptions = {},
): Promise<DesignResult<Design>> {
  return parseDesignAsync(source, options);
}
