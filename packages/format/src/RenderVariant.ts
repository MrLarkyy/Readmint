import type { ComponentPropValue } from "./Design.js";

/** A named way to render one design differently: root component props set on top of the design. */
export interface RenderVariant {
  readonly name: string;
  readonly props: Readonly<Record<string, ComponentPropValue>>;
}

export const renderVariants: readonly RenderVariant[] = Object.freeze([
  Object.freeze({ name: "dark", props: Object.freeze({ theme: "dark" }) }),
]);

/** The variant with exactly this name; any other text, `__proto__` and `constructor` included, has none. */
export function renderVariant(name: string): RenderVariant | undefined {
  return renderVariants.find((variant) => variant.name === name);
}
