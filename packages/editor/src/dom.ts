/** Attributes and text of a new element; text is set as `textContent`, never parsed as markup. */
export interface ElementProps {
  readonly className?: string;
  readonly text?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  /** Inline styles by their camelCase name: what the overlay needs to work, not its look. */
  readonly style?: Readonly<Record<string, string>>;
}

/** A new element of the document `parent` belongs to, appended to it. */
export function element<K extends keyof HTMLElementTagNameMap>(
  parent: Element,
  tag: K,
  props: ElementProps = {},
): HTMLElementTagNameMap[K] {
  const node = parent.ownerDocument.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attributes ?? {}))
    node.setAttribute(name, value);
  Object.assign(node.style, props.style ?? {});
  parent.append(node);
  return node;
}

/** Removes every child of `node`. */
export function clear(node: Element): void {
  node.replaceChildren();
}

/** The bytes of a file the user picked. */
export async function fileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** The first file of a file input, once; the input is reset so the same file can be picked again. */
export function takeFile(input: HTMLInputElement): File | undefined {
  const file = input.files?.[0];
  input.value = "";
  return file;
}
