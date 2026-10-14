export interface RenderAssetUsage {
  readonly asset: string;
  /**
   * Bytes the asset adds to the SVG: its data URI, written once however often it is drawn; 0 for an image whose
   * identical bytes an earlier asset already wrote.
   */
  readonly bytes: number;
}

/** Size of a successful render; assets in the order they were first used. */
export interface RenderReport {
  /** UTF-8 bytes of the SVG. */
  readonly bytes: number;
  /** The `maxOutputBytes` the render ran with. */
  readonly limit: number;
  readonly fonts: readonly RenderAssetUsage[];
  readonly images: readonly RenderAssetUsage[];
  /** The design's timeline, when it has one: what `frameTimes` takes. */
  readonly animation?: { readonly duration: number; readonly loop: boolean };
}
