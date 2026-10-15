export interface ParseSfntOptions {
  /**
   * Most bytes the font may declare or decompress to (WOFF, WOFF2), checked before decompressing.
   * Default 4 MiB, the renderer's default font limit.
   */
  readonly maxBytes?: number;
}

export const defaultMaxFontBytes = 4_194_304;
