/** One rendered file: the design it comes from and where it goes. */
export interface PlannedFile {
  /** The design file relative to the workspace, as loaded. */
  readonly design: string;
  /** The output file relative to the workspace, `/`-separated. */
  readonly output: string;
}

/** A listed design, its output and, when a `<stem>.dark.<ext>` lies next to it, the dark twin's. */
export interface PlannedDesign {
  /** The design's file name without its last extension: the output name and the image's alt text. */
  readonly stem: string;
  readonly light: PlannedFile;
  readonly dark?: PlannedFile;
}
