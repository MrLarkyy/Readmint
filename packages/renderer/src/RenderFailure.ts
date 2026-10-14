import type { RenderIssue, RenderIssueCode } from "./RenderIssue.js";

/** Ends a render at its first issue; `renderSvg` turns it into `{ ok: false }`. */
export class RenderFailure extends Error {
  readonly issue: RenderIssue;

  constructor(path: string, code: RenderIssueCode, message: string) {
    super(message);
    this.issue = { path, code, message };
  }
}
