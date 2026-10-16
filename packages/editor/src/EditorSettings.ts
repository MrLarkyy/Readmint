import type { DesignProps } from "@readmint/format";

/** A settings file loaded into the session (the CLI's `--props` file) and the one section that applies to the design. */
export interface EditorSettings {
  /** Every section of the file, by name. */
  readonly sections: DesignProps;
  /** The applied section; none renders the design as it is. */
  readonly section?: string;
}
