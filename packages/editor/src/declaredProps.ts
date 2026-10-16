import {
  DesignLimits,
  type ComponentPropDefinition,
  type ComponentPropValue,
  type Design,
} from "@readmint/format";

/** The props the top-level component layers of `design` declare, by name in declaration order; the first definition wins. */
export function declaredProps(design: Design): ReadonlyMap<string, ComponentPropDefinition> {
  const declared = new Map<string, ComponentPropDefinition>();
  for (const layer of design.layers) {
    if (layer.type !== "component") continue;
    const props = design.components?.[layer.ref]?.props;
    if (props === undefined) continue;
    for (const name of Object.keys(props)) {
      const definition = props[name];
      if (definition !== undefined && !declared.has(name)) declared.set(name, definition);
    }
  }
  return declared;
}

/** The value the first top-level component layer that declares and sets `name` gives it; undefined when none does. */
export function layerValue(design: Design, name: string): ComponentPropValue | undefined {
  for (const layer of design.layers) {
    if (layer.type !== "component") continue;
    const declares = design.components?.[layer.ref]?.props;
    if (declares === undefined || !Object.hasOwn(declares, name)) continue;
    if (layer.props !== undefined && Object.hasOwn(layer.props, name)) return layer.props[name];
  }
  return undefined;
}

/**
 * The props of `section` that no top-level component declares, at most `DesignLimits.maxIssues` (a hostile section
 * can have a million), and whether there are more.
 */
export function undeclaredProps(
  section: Readonly<Record<string, unknown>>,
  declared: ReadonlyMap<string, unknown>,
): { names: string[]; truncated: boolean } {
  const names: string[] = [];
  for (const name in section) {
    if (!Object.hasOwn(section, name) || declared.has(name)) continue;
    if (names.length >= DesignLimits.maxIssues) return { names, truncated: true };
    names.push(name);
  }
  return { names, truncated: false };
}
