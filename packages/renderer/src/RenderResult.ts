import type { LayerBox } from "./LayerBox.js";
import type { RenderIssue } from "./RenderIssue.js";
import type { RenderReport } from "./RenderReport.js";

export type RenderResult =
  | {
      readonly ok: true;
      readonly svg: string;
      readonly report: RenderReport;
      readonly warnings: readonly RenderIssue[];
      /** Only with the `layerBoxes` option: one box per drawn node, in paint order. */
      readonly layerBoxes?: readonly LayerBox[];
    }
  | { readonly ok: false; readonly issues: readonly RenderIssue[] };
