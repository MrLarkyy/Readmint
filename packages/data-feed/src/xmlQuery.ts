import { BLOCK_ELEMENTS, HIDDEN_ELEMENTS } from "./htmlElements.js";
import type { XmlElement } from "./XmlElement.js";

/** The child elements with this namespace and local name, in document order. */
export function childElements(parent: XmlElement, namespace: string, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  for (const child of parent.children) {
    if (typeof child !== "string" && child.namespace === namespace && child.name === name) {
      found.push(child);
    }
  }
  return found;
}

/** The first child element with this namespace and local name. */
export function childElement(
  parent: XmlElement,
  namespace: string,
  name: string,
): XmlElement | undefined {
  for (const child of parent.children) {
    if (typeof child !== "string" && child.namespace === namespace && child.name === name) {
      return child;
    }
  }
  return undefined;
}

/**
 * The text of every descendant in document order. With `blocks` (xhtml content), a space stands
 * at each block element boundary, so `<p>a</p><p>b</p>` reads `a b`, and script or style content
 * is dropped; without, the text joins as written. Iterative: the parser caps depth, but nothing
 * here relies on it.
 */
export function textContent(element: XmlElement, blocks = false): string {
  const parts: string[] = [];
  const pending: (XmlElement | string)[] = [element];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (typeof node === "string") {
      parts.push(node);
      continue;
    }
    if (node !== element && blocks) {
      const name = node.name.toLowerCase();
      if (HIDDEN_ELEMENTS.has(name)) continue;
      if (BLOCK_ELEMENTS.has(name)) {
        parts.push(" ");
        // Popped after every child: the space that closes the element.
        pending.push(" ");
      }
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child !== undefined) pending.push(child);
    }
  }
  return parts.join("");
}
