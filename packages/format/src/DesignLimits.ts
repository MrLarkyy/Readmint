/** Bounds applied to every untrusted design before and during validation. */
export const DesignLimits = Object.freeze({
  /** Source text length in UTF-16 code units, checked before parsing. */
  maxSourceLength: 4_194_304,
  /** YAML source text length in UTF-16 code units; the YAML parser is far slower than the JSON scanner. */
  maxYamlSourceLength: 1_048_576,
  /** Nesting of objects and arrays; the root object is level 1. */
  maxDepth: 64,
  /** Values visited in the parsed document (YAML aliases count each time they are used). */
  maxValues: 1_000_000,
  /** Layers of the document after expanding component instances. */
  maxLayers: 10_000,
  /** Entries of one layer's `let`. */
  maxLetEntries: 64,
  /** Modes of the design's `palette`. */
  maxPaletteModes: 16,
  /** Tokens of one palette mode. */
  maxPaletteTokens: 256,
  /** Characters of one `{{binding}}`, the braces included. */
  maxBindingLength: 2048,
  /** Issues reported before the result is marked truncated. */
  maxIssues: 100,
  /** YAML alias nodes in a source, checked before any alias is resolved. */
  maxAliases: 100,
  /** Characters of an input value an issue message may echo. */
  maxEcho: 64,
});

export type DesignLimits = typeof DesignLimits;
