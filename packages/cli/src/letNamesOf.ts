import type { Design, Layer } from "@readmint/format";

/** One `let` name of a design and the JSON pointer of its entry. */
export interface LetName {
  readonly name: string;
  readonly path: string;
}

/**
 * Every `let` name of the document layers and of every component's layers, groups' children included, in document
 * order. A plain walk: names reaching a log are the ones a caller matches against its own safe names.
 */
export function letNamesOf(design: Design): readonly LetName[] {
  const found: LetName[] = [];
  walk(design.layers, "/layers", found);
  const components = design.components ?? {};
  for (const id of Object.keys(components)) {
    const layers = components[id]?.layers;
    if (layers !== undefined) walk(layers, `/components/${escapeKey(id)}/layers`, found);
  }
  return found;
}

function walk(layers: readonly Layer[], path: string, found: LetName[]): void {
  layers.forEach((layer, index) => {
    const at = `${path}/${String(index)}`;
    const bound = layer.let ?? {};
    for (const name of Object.keys(bound))
      found.push({ name, path: `${at}/let/${escapeKey(name)}` });
    if (layer.type === "group") walk(layer.children, `${at}/children`, found);
  });
}

function escapeKey(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
