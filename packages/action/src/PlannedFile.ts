import type { OutputFormat, RenderEntry, RenderVariant } from "@readmint/cli";

/** One file a design is written to. */
export interface PlannedOutput {
  readonly format: OutputFormat;
  /** Relative to the workspace, `/`-separated: `<output-dir>/<stem>[.dark].<ext>`. */
  readonly output: string;
}

/** One design file to render and where each of its formats goes. */
export interface PlannedFile {
  /** The design file relative to the workspace, as loaded. */
  readonly design: string;
  /** Set when the file is rendered from `design` with the variant's props, not from a design of its own. */
  readonly variant?: RenderVariant;
  /** A render of the manifest: its props are set on the design, and its name is the settings section. */
  readonly entry?: RenderEntry;
  /** With `entry`: the manifest's folder relative to the workspace, the root the design is loaded in. */
  readonly root?: string;
  /** One per format, in the order the `formats` input lists them. */
  readonly outputs: readonly PlannedOutput[];
}
