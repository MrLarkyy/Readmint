import type { ExampleProp } from "./profileExampleProps.js";

export interface ExamplesOptions {
  /** The GitHub login the READMEs are written for. */
  readonly login: string;
  /** The Action reference the workflow uses, `owner/repository@version`. */
  readonly actionRef: string;
  /** The personal texts per template folder and section, merged into the root props of the designs. */
  readonly props: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, ExampleProp>>>>>
  >;
  /** Where the template folders live in the main repository, for the links to their READMEs. */
  readonly repositoryUrl?: string;
}
