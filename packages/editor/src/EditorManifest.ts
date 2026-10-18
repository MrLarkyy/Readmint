import type { RenderManifestEntry } from "@readmint/format";

/** A loaded render manifest and the render the editor applies; a session input, never part of the design. */
export interface EditorManifest {
  readonly renders: readonly RenderManifestEntry[];
  /** Name of the chosen render; absent, none applies. */
  readonly render?: string;
}
