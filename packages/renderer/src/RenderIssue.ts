export type RenderIssueCode =
  | "binding"
  | "type"
  | "range"
  | "missing-asset"
  | "asset-format"
  | "asset-too-large"
  | "unsupported-font"
  | "font-not-embeddable"
  | "too-large"
  | "font-family-mismatch"
  | "animation-cut";

/** Why a render failed, or a warning about a successful one. */
export interface RenderIssue {
  /** RFC 6901 JSON Pointer into the design ("" is the root). */
  readonly path: string;
  readonly code: RenderIssueCode;
  readonly message: string;
}
