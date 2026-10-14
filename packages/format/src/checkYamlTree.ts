import { isAlias, isMap, isNode, isScalar, isSeq, type Document, type Node } from "yaml";
import type { DesignIssue } from "./DesignIssue.js";
import { DesignLimits } from "./DesignLimits.js";
import type { IssueCollector } from "./IssueCollector.js";
import type { LineIndex } from "./LineIndex.js";
import { quoteInput } from "./quoteInput.js";

/**
 * One linear, iterative pass over the parsed YAML tree before `toJS`: duplicate keys (a Set per
 * map; the library's `uniqueKeys` compares pairwise), aliases to no earlier anchor, the alias
 * count (`toJS` resolves each alias by scanning every anchor before it) and nesting depth.
 * Issues are added in document order.
 */
export function checkYamlTree(document: Document, lines: LineIndex, issues: IssueCollector): void {
  const found: { offset: number; issue: Omit<DesignIssue, "line" | "column"> }[] = [];
  const report = (node: Node, code: DesignIssue["code"], message: string): void => {
    found.push({ offset: node.range?.[0] ?? 0, issue: { path: "", code, message } });
  };
  const anchors = new Set<string>();
  const stack: { node: unknown; depth: number }[] = [{ node: document.contents, depth: 0 }];
  let aliases = 0;

  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const { node, depth } = entry;
    if (isAlias(node)) {
      if (++aliases > DesignLimits.maxAliases) {
        report(node, "too-large", `more than ${String(DesignLimits.maxAliases)} YAML aliases`);
        break;
      }
      if (!anchors.has(node.source))
        report(node, "parse", `unknown YAML alias ${quoteInput(node.source)}`);
      continue;
    }
    if (!isNode(node)) continue;
    if (node.anchor !== undefined) anchors.add(node.anchor);
    if (!isMap(node) && !isSeq(node)) continue;
    if (depth + 1 > DesignLimits.maxDepth) {
      report(
        node,
        "too-deep",
        `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`,
      );
      break;
    }
    const children: unknown[] = [];
    if (isMap(node)) {
      const keys = new Set<string>();
      for (const pair of node.items) {
        if (isScalar(pair.key)) {
          const key = String(pair.key.value);
          if (keys.has(key)) report(pair.key, "duplicate-key", `duplicate key ${quoteInput(key)}`);
          keys.add(key);
        }
        children.push(pair.key, pair.value);
      }
    } else for (const item of node.items) children.push(item);
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ node: children[index], depth: depth + 1 });
  }

  found.sort((a, b) => a.offset - b.offset);
  for (const { offset, issue } of found) issues.add({ ...issue, ...lines.at(offset) });
}
