import type { Design } from "@readmint/format";
import { renderSvg, type RenderAssets, type RenderResult } from "@readmint/renderer";

/** What a preview render reads of the editor state. */
export interface PreviewInput {
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly sessionAssets: RenderAssets;
}

/**
 * The editor's only render: `renderSvg` unchanged, with the fixture data and the session's asset bytes, plus the
 * layer boxes (which never change the SVG). The CLI rendering the exported design with the same data file gives
 * the same bytes.
 */
export function renderPreview(input: PreviewInput): RenderResult {
  return renderSvg(input.design, {
    data: input.data,
    assets: input.sessionAssets,
    layerBoxes: true,
  });
}
