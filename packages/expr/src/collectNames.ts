import type { ExprNode } from "./ExprNode.js";

/**
 * Adds to `names` every name `node` reads from its scope: the names of the expression, not the property steps of a
 * path (`x.props` reads `x`) or the text of string literals. Recursion follows the parser's nesting, which `maxDepth`
 * bounds; long operator chains, paths and pipes are flat lists walked by loops.
 */
export function collectNames(node: ExprNode, names: Set<string>): void {
  switch (node.kind) {
    case "literal":
      return;
    case "name":
      names.add(node.name);
      return;
    case "array":
      for (const item of node.items) collectNames(item, names);
      return;
    case "path":
      collectNames(node.target, names);
      for (const step of node.steps) if (step.kind === "index") collectNames(step.key, names);
      return;
    case "unary":
      collectNames(node.operand, names);
      return;
    case "chain":
      collectNames(node.first, names);
      for (const link of node.links) collectNames(link.operand, names);
      return;
    case "logical":
      for (const operand of node.operands) collectNames(operand, names);
      return;
    case "conditional":
      collectNames(node.test, names);
      collectNames(node.consequent, names);
      collectNames(node.alternate, names);
      return;
    case "pipe":
      collectNames(node.input, names);
      for (const filter of node.filters) for (const arg of filter.args) collectNames(arg, names);
      return;
  }
}
