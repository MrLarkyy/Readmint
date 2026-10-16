import type { DesignProps } from "@readmint/format";

/** A settings file loaded into the session (the CLI's `--props` file) and the one section that applies to the design. */
export interface EditorSettings {
  /** Every section of the file, by name, edited props included. Records have no prototype. */
  readonly sections: DesignProps;
  /** The applied section; none renders the design as it is. */
  readonly section?: string;
  /** The text the file was loaded from; an export splices edited sections into it so the rest stays byte for byte. */
  readonly source?: string;
  /** The sections as parsed from `source`: what an unedited section is compared with. */
  readonly loaded?: DesignProps;
}
