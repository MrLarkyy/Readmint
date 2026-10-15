import type { DesignResult } from "./DesignResult.js";
import { designFailure } from "./designFailure.js";
import { DesignLimits } from "./DesignLimits.js";

export type DesignSourceFormat = "json" | "yaml";

export type PreparedDesignSource =
  | { readonly result: DesignResult<unknown> }
  | { readonly result?: undefined; readonly format: DesignSourceFormat; readonly text: string };

/** The checks shared by the sync and async readers: type, length, BOM, format choice. */
export function prepareDesignSource(
  source: string,
  format?: DesignSourceFormat,
): PreparedDesignSource {
  if (typeof source !== "string")
    return {
      result: designFailure([
        { path: "", code: "type", message: "expected the design source text" },
      ]),
    };
  if (source.length > DesignLimits.maxSourceLength)
    return { result: tooLong("source", DesignLimits.maxSourceLength) };
  const text = source.startsWith(String.fromCharCode(0xfeff)) ? source.slice(1) : source;
  const chosen = format ?? (/^\s*\{/u.test(text) ? "json" : "yaml");
  if (chosen === "yaml" && source.length > DesignLimits.maxYamlSourceLength)
    return { result: tooLong("YAML source", DesignLimits.maxYamlSourceLength) };
  return { format: chosen, text };
}

function tooLong(what: string, limit: number): DesignResult<unknown> {
  return designFailure([
    {
      path: "",
      code: "too-large",
      message: `the ${what} is longer than ${String(limit)} characters`,
    },
  ]);
}
