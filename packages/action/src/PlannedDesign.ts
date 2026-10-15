import type { PlannedFile } from "./PlannedFile.js";

/** A listed design, its outputs and, when a `<stem>.dark.<ext>` lies next to it, the dark twin's. */
export interface PlannedDesign {
  /** The design's file name without its last extension: the output name and the image's alt text. */
  readonly stem: string;
  readonly light: PlannedFile;
  readonly dark?: PlannedFile;
}
