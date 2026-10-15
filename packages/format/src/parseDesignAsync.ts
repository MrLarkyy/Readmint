import type { Design } from "./Design.js";
import type { DesignResult } from "./DesignResult.js";
import type { ParseDesignOptions } from "./parseDesign.js";
import { parseDesignSourceAsync } from "./parseDesignSourceAsync.js";
import { validateDesign } from "./validateDesign.js";

/** parseDesign with the YAML parser loaded on demand; the result is the same. */
export async function parseDesignAsync(
  source: string,
  options: ParseDesignOptions = {},
): Promise<DesignResult<Design>> {
  const parsed = await parseDesignSourceAsync(source, options.format);
  return parsed.ok ? validateDesign(parsed.value) : parsed;
}
