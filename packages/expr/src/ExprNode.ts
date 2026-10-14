import type { Span } from "./Span.js";

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=";

/**
 * Operator chains, paths and pipes are flat lists, not left-deep trees, so a long `a + b + ...`,
 * `a.b.c...` or `a | f | g ...` is evaluated by a loop; only the nesting counted against
 * `maxDepth` makes the tree deeper.
 */
export type ExprNode =
  | LiteralNode
  | ArrayNode
  | NameNode
  | PathNode
  | UnaryNode
  | ChainNode
  | LogicalNode
  | ConditionalNode
  | PipeNode;

export interface LiteralNode extends Span {
  readonly kind: "literal";
  readonly value: null | boolean | number | string;
}

export interface ArrayNode extends Span {
  readonly kind: "array";
  readonly items: readonly ExprNode[];
}

export interface NameNode extends Span {
  readonly kind: "name";
  readonly name: string;
}

export type PathStep =
  | (Span & { readonly kind: "property"; readonly name: string })
  | (Span & { readonly kind: "index"; readonly key: ExprNode });

export interface PathNode extends Span {
  readonly kind: "path";
  readonly target: ExprNode;
  readonly steps: readonly PathStep[];
}

export interface UnaryNode extends Span {
  readonly kind: "unary";
  readonly operator: "!" | "-";
  readonly operand: ExprNode;
}

/** `start` is the operator's offset, `end` the operand's end. */
export interface ChainLink extends Span {
  readonly operator: BinaryOperator;
  readonly operand: ExprNode;
}

export interface ChainNode extends Span {
  readonly kind: "chain";
  readonly first: ExprNode;
  readonly links: readonly ChainLink[];
}

export interface LogicalNode extends Span {
  readonly kind: "logical";
  readonly operator: "&&" | "||";
  readonly operands: readonly ExprNode[];
}

export interface ConditionalNode extends Span {
  readonly kind: "conditional";
  readonly test: ExprNode;
  readonly consequent: ExprNode;
  readonly alternate: ExprNode;
}

export interface FilterCall extends Span {
  readonly name: string;
  readonly args: readonly ExprNode[];
}

export interface PipeNode extends Span {
  readonly kind: "pipe";
  readonly input: ExprNode;
  readonly filters: readonly FilterCall[];
}
