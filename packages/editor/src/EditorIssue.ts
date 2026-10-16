/** Where an editor issue comes from: the area of the editor that shows it. */
export type EditorIssueSource =
  "design" | "import" | "font" | "image" | "asset" | "fixture" | "settings" | "preview" | "export";

/** A problem the editor shows the user; `path` is a JSON Pointer into the design when one applies. */
export interface EditorIssue {
  readonly source: EditorIssueSource;
  readonly message: string;
  readonly path?: string;
}
