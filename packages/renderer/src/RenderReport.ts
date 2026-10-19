import type { RenderFontUsage } from "./RenderFontUsage.js";

export interface RenderAssetUsage {
  readonly asset: string;
  /**
   * Bytes the asset adds to the SVG: its data URI, written once however often it is drawn (an image with EXIF data
   * stays inline, once per use); 0 for an image whose identical bytes an earlier asset already wrote.
   */
  readonly bytes: number;
}

/** Size of a successful render; assets in the order they were first used. */
export interface RenderReport {
  /** UTF-8 bytes of the SVG. */
  readonly bytes: number;
  /** The `maxOutputBytes` the render ran with. */
  readonly limit: number;
  /** Fonts that drew at least one glyph. */
  readonly fonts: readonly RenderFontUsage[];
  readonly images: readonly RenderAssetUsage[];
  /** The palette mode the render used (after `theme`, variant and section); absent when the design has no palette. */
  readonly paletteMode?: string;
  /** The design's timeline, when it has one: what `frameTimes` takes. */
  readonly animation?: { readonly duration: number; readonly loop: boolean };
}
