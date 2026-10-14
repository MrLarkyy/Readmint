import type { CST } from "yaml";
import { DesignLimits } from "./DesignLimits.js";

/**
 * Offset of the first collection (in document order) nested deeper than `maxDepth`, found by an
 * iterative walk over yaml's concrete syntax tree. Run before composing: yaml composes
 * recursively, and where it runs out of stack depends on the caller's stack, not on the source.
 */
export function findDeepYamlCollection(tokens: readonly CST.Token[]): number | undefined {
  const stack: { token: CST.Token; depth: number }[] = [];
  const push = (token: CST.Token | null | undefined, depth: number): void => {
    if (token !== null && token !== undefined) stack.push({ token, depth });
  };
  for (let index = tokens.length - 1; index >= 0; index--) push(tokens[index], 0);
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const { token } = entry;
    if (token.type === "document") {
      push(token.value, entry.depth);
    } else if (
      token.type === "block-map" ||
      token.type === "block-seq" ||
      token.type === "flow-collection"
    ) {
      const depth = entry.depth + 1;
      if (depth > DesignLimits.maxDepth) return token.offset;
      for (let index = token.items.length - 1; index >= 0; index--) {
        const item = token.items[index];
        push(item?.value, depth);
        push(item?.key, depth);
      }
    }
  }
  return undefined;
}
