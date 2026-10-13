import type { FixtureCheck } from "../node/FixtureCheck.js";

export interface GoldenBrowserRequest {
  fixture: string;
  /** Raw SVG the browser rendered. */
  svg: string;
  /** PNG the browser rasterized from that SVG, base64. */
  pngBase64: string;
}

export type GoldenBrowserResult = FixtureCheck;
