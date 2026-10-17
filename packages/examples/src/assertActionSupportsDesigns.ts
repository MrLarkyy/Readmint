import { isPinnedOlderThan } from "./isPinnedOlderThan.js";

/** The Action version that introduced each expression filter the templates may use; add a filter here when a release adds one. */
const filterIntroducedIn: Readonly<Record<string, string>> = {
  textWidth: "0.3.0",
  truncateWidth: "0.3.0",
};

/**
 * The Action version that accepts each layer property format v0 gained after a release; an older Action refuses a
 * design using it as `unknown-property`. Add a property here in the change that adds it to the format.
 */
const propertyIntroducedIn: Readonly<Record<string, string>> = {
  maxLines: "0.4.0",
  let: "0.4.0",
  orbit: "0.4.0",
};

/**
 * Throws when `actionRef` pins a full `vX.Y.Z` tag older than a filter a design uses (`| name`) or than a layer
 * property it sets (a key of a layer of the document or of a component, at any depth of `children`). Other references
 * (`@main`, `@v0`, a commit) are not compared.
 */
export function assertActionSupportsDesigns(
  actionRef: string,
  designs: readonly { readonly file: string; readonly text: string }[],
): void {
  for (const { file, text } of designs) {
    for (const [filter, introduced] of Object.entries(filterIntroducedIn)) {
      if (
        new RegExp(String.raw`\|\s*${filter}\b`).test(text) &&
        isPinnedOlderThan(actionRef, introduced)
      ) {
        refuse(actionRef, filter, introduced, file);
      }
    }
    const properties = layerProperties(text);
    for (const [property, introduced] of Object.entries(propertyIntroducedIn)) {
      if (properties.has(property) && isPinnedOlderThan(actionRef, introduced)) {
        refuse(actionRef, property, introduced, file);
      }
    }
  }
}

function refuse(actionRef: string, feature: string, introduced: string, file: string): never {
  throw new Error(
    `${actionRef} predates ${feature} (Action v${introduced}), which ${file} uses; pin v${introduced} or newer`,
  );
}

/** The property names set on any layer of a design text; none when the text is no JSON object. */
function layerProperties(text: string): ReadonlySet<string> {
  const found = new Set<string>();
  let design: unknown;
  try {
    design = JSON.parse(text);
  } catch {
    return found;
  }
  if (!isRecord(design)) return found;
  const visit = (layers: unknown): void => {
    if (!Array.isArray(layers)) return;
    for (const layer of layers) {
      if (!isRecord(layer)) continue;
      for (const key of Object.keys(layer)) found.add(key);
      visit(layer["children"]);
    }
  };
  visit(design["layers"]);
  const components = design["components"];
  if (isRecord(components)) {
    for (const definition of Object.values(components))
      if (isRecord(definition)) visit(definition["layers"]);
  }
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
