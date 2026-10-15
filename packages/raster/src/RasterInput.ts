import type { Animation } from "@readmint/format";

/** What a raster export draws: the renderer's SVG, frame by frame. */
export interface RasterInput {
  /**
   * The static SVG at `time` ms on the timeline (`renderSvg` with `time`), or the design's SVG when `time` is
   * undefined. Throws when the frame cannot be rendered.
   */
  frame(time?: number): string;
  /** The design's timeline (`RenderReport.animation`); absent for a still design. */
  readonly animation?: Animation;
  /** TTF or OTF fonts drawn with besides the ones the SVG embeds. */
  readonly fonts?: readonly Uint8Array[];
}
