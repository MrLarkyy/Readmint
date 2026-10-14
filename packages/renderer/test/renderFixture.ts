import type { Design } from "@readmint/format";
import { renderSvg } from "../src/index.js";

export interface RenderFixture {
  readonly design: Design;
  readonly data?: Readonly<Record<string, unknown>>;
  /** Renders the static frame at this many milliseconds of the design's timeline. */
  readonly time?: number;
}

/** Renders a golden fixture; a failed render is a test failure naming the issues. */
export function renderFixture({ design, data, time }: RenderFixture): string {
  const result = renderSvg(design, { data: data ?? {}, ...(time === undefined ? {} : { time }) });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}
