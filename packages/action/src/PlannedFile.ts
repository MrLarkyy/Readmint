/** One rendered file: the design it comes from and where it goes. */
export interface PlannedFile {
  /** The design file relative to the workspace, as loaded. */
  readonly design: string;
  /** The output file relative to the workspace, `/`-separated. */
  readonly output: string;
}
