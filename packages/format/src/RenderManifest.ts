import type { ComponentPropValue } from "./Design.js";
import type { RenderVariant } from "./RenderVariant.js";

/** One named render of a design: the design file, root props set on it and the variants rendered next to it. */
export interface RenderManifestEntry {
  /** The output name: an id, not a Windows device name, unique ignoring letter case. */
  readonly name: string;
  /** Relative to the manifest folder, `/`-separated, never leaving it. */
  readonly design: string;
  /** Root component props set on the design, before the variant and the settings section. */
  readonly props: Readonly<Record<string, ComponentPropValue>>;
  /** Absent: the run's variant; an empty list: none. */
  readonly variants?: readonly RenderVariant[];
}

/** The named renders one folder of designs produces. */
export interface RenderManifest {
  readonly renders: readonly RenderManifestEntry[];
}
