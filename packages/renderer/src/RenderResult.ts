import type { RenderIssue } from "./RenderIssue.js";
import type { RenderReport } from "./RenderReport.js";

export type RenderResult =
  | {
      readonly ok: true;
      readonly svg: string;
      readonly report: RenderReport;
      readonly warnings: readonly RenderIssue[];
    }
  | { readonly ok: false; readonly issues: readonly RenderIssue[] };
