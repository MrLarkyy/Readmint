import type { OutputFormat, RenderVariant } from "@readmint/cli";

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
  /** One per format, in the order the `formats` input lists them. */
  readonly outputs: readonly PlannedOutput[];
}
