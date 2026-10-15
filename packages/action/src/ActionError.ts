/** What failed: the step that reports it, so a log line says which part of the run to fix. */
export type ActionErrorKind = "input" | "data" | "render" | "output" | "git";

/**
 * A failure the Action reports as `::error::` lines before it exits with 1. The lines name
 * workspace-relative paths only, values quoted with `quoteForLog`; never a token, an absolute
 * path or a raw Node error message.
 */
export class ActionError extends Error {
  override readonly name = "ActionError";
  readonly kind: ActionErrorKind;
  readonly lines: readonly string[];

  constructor(kind: ActionErrorKind, lines: string | readonly string[]) {
    const all = typeof lines === "string" ? [lines] : [...lines];
    super(all.join("\n"));
    this.kind = kind;
    this.lines = all;
  }
}
