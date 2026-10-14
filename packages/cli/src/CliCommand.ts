/** Arguments every design command takes. */
export interface DesignArgs {
  /** The design file as given; resolved against the working folder, must lie inside `root`. */
  readonly design: string;
  /** Folder the design file must lie in; default the working folder. */
  readonly root?: string;
  /** Fixture data file (`--data`). */
  readonly data?: string;
  readonly locale?: string;
}

/** A parsed command line. */
export type CliCommand =
  | { readonly name: "help" }
  | { readonly name: "version" }
  | (DesignArgs & { readonly name: "render"; readonly time?: number; readonly out?: string })
  | (DesignArgs & { readonly name: "validate"; readonly time?: number })
  | (DesignArgs & { readonly name: "preview"; readonly port: number });
