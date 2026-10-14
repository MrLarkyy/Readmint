/** Bounds applied to every untrusted design before and during validation. */
export const DesignLimits = Object.freeze({
  /** Source text length in UTF-16 code units, checked before parsing. */
  maxSourceLength: 4_194_304,
  /** Nesting of objects and arrays; the root object is level 1. */
  maxDepth: 64,
  /** Values visited in the parsed document (YAML aliases count each time they are used). */
  maxValues: 1_000_000,
  /** Layers of the document after expanding component instances. */
  maxLayers: 10_000,
  /** Issues reported before the result is marked truncated. */
  maxIssues: 100,
  /** YAML alias expansions (per anchor, weighted by aliases inside it). */
  maxAliasCount: 32,
  /** Characters of an input value an issue message may echo. */
  maxEcho: 64,
});

export type DesignLimits = typeof DesignLimits;
