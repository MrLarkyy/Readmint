/** Stable machine-readable reason of a design issue; part of the public contract. */
export type DesignIssueCode =
  | "parse"
  | "duplicate-key"
  | "too-large"
  | "too-deep"
  | "unsupported-version"
  | "migration-missing"
  | "missing-property"
  | "unknown-property"
  | "type"
  | "enum"
  | "pattern"
  | "range"
  | "length"
  | "count"
  | "duplicate-id"
  | "unknown-reference"
  | "component-cycle"
  | "missing-font"
  | "too-many-layers";

export interface DesignIssue {
  /** RFC 6901 JSON Pointer into the document; "" is the root. */
  readonly path: string;
  readonly code: DesignIssueCode;
  readonly message: string;
  /** 1-based, set on issues found while parsing the source text. */
  readonly line?: number;
  /** 1-based, in UTF-16 code units. */
  readonly column?: number;
}
