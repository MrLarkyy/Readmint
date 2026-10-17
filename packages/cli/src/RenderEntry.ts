import type { ComponentPropValue } from "@readmint/format";

/** One render of a manifest, as `loadRenderInput` takes it: its props are set on the design before the variant. */
export interface RenderEntry {
  /** The render name: the settings section of this render and the label of its messages. */
  readonly name: string;
  readonly props: Readonly<Record<string, ComponentPropValue>>;
  /** Pointer of the entry in the manifest (`/renders/<i>`). */
  readonly at: string;
  /** The manifest as messages name it: `manifest "<file>"`. */
  readonly manifest: string;
}
