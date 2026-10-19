import type { Design } from "@readmint/format";
import { renderSvg, type RenderAssets, type RenderResult } from "@readmint/renderer";

/** What a preview render reads of the editor state. */
export interface PreviewInput {
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly sessionAssets: RenderAssets;
  /** Milliseconds on the timeline: the still frame at that time (what `readmint render --time` gives), else the animated SVG. */
  readonly time?: number;
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
    ...(input.time === undefined ? {} : { time: input.time }),
  });
}
