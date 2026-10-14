import type { ExprNode } from "./ExprNode.js";
import type { ExprResult } from "./ExprResult.js";
import type { ExprValue } from "./ExprValue.js";
import type { Scope } from "./Scope.js";
import type { Span } from "./Span.js";

/**
 * `expression`: the whole text is one `{{ }}` placeholder and evaluates to its value with its type.
 * `text`: anything else; evaluates to a string with every placeholder written into it.
 */
export type TemplateKind = "expression" | "text";

export type TemplatePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "expression"; readonly node: ExprNode; readonly segment: Span };

/** A compiled text: compile once, evaluate against many scopes. */
export interface Template {
  readonly source: string;
  readonly kind: TemplateKind;
  evaluate(scope: Scope): ExprResult<ExprValue>;
}
