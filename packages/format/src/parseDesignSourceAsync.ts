import type { DesignResult } from "./DesignResult.js";
import { parseJsonText } from "./parseJsonText.js";
import { prepareDesignSource, type DesignSourceFormat } from "./prepareDesignSource.js";

/**
 * Like parseDesignSource, but the YAML parser is loaded on first use, so a bundler can keep it out
 * of the initial chunk. Results are identical.
 */
export async function parseDesignSourceAsync(
  source: string,
  format?: DesignSourceFormat,
): Promise<DesignResult<unknown>> {
  const prepared = prepareDesignSource(source, format);
  if (prepared.result !== undefined) return prepared.result;
  if (prepared.format === "json") return parseJsonText(prepared.text);
  const { parseYamlText } = await import("./parseYamlText.js");
  return parseYamlText(prepared.text);
}
