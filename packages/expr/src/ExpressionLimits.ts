/** Bounds applied to every template while it is compiled and evaluated; part of the public contract. */
export const ExpressionLimits = Object.freeze({
  /**
   * Length of a compiled text in code points (a surrogate pair counts once), as the design format counts string
   * lengths; checked before scanning.
   */
  maxSourceLength: 10_000,
  /** Nesting of parentheses, brackets, unary operators, conditional branches and filter arguments. */
  maxDepth: 64,
  /** Steps one evaluation may take unless the scope carries a shared budget. */
  maxSteps: 100_000,
  /** Length of any string an evaluation produces, in UTF-16 code units. */
  maxStringLength: 100_000,
  /** Items of an array literal and of a repeat. */
  maxArrayLength: 10_000,
  /** Arguments of one filter call. */
  maxFilterArgs: 4,
  /** Characters of the source an error excerpt shows. */
  maxEcho: 64,
});

export type ExpressionLimits = typeof ExpressionLimits;
