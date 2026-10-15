import type { DesignResult } from "./DesignResult.js";
import { parseJsonText } from "./parseJsonText.js";
import { parseYamlText } from "./parseYamlText.js";
import { prepareDesignSource, type DesignSourceFormat } from "./prepareDesignSource.js";

export type { DesignSourceFormat };

/**
 * Source text to a plain value. Auto format: JSON when the first non-whitespace character is `{`,
 * else YAML. Issues found here carry line and column; their path is the root.
 */
export function parseDesignSource(
  source: string,
  format?: DesignSourceFormat,
): DesignResult<unknown> {
  const prepared = prepareDesignSource(source, format);
  if (prepared.result !== undefined) return prepared.result;
  return prepared.format === "json" ? parseJsonText(prepared.text) : parseYamlText(prepared.text);
}
