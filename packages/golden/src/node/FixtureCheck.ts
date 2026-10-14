export interface FixtureCheck {
  problems: string[];
  /** Paths of the files written for a human to look at (actual, diff) or, in update mode, of the goldens written. */
  artefacts: string[];
}
