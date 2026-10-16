import type { ComponentPropValue, Design } from "@readmint/format";

/** Pointers of the props `applyDesignProps` wrote into `design`: top-level component layers, declared props only. */
export function settingsPointers(
  design: Design,
  props: Readonly<Record<string, ComponentPropValue>>,
): string[] {
  const pointers: string[] = [];
  design.layers.forEach((layer, index) => {
    if (layer.type !== "component") return;
    const declared = design.components?.[layer.ref]?.props ?? {};
    for (const name of Object.keys(props)) {
      if (Object.hasOwn(declared, name)) pointers.push(`/layers/${String(index)}/props/${name}`);
    }
  });
  return pointers;
}
