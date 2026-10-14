import type { Design } from "@readmint/format";
import { renderSvg } from "../src/index.js";
import { testEvaluator } from "./testEvaluator.js";

export interface RenderFixture {
  readonly design: Design;
  readonly data?: unknown;
}

/** Renders a golden fixture; a failed render is a test failure naming the issues. */
export function renderFixture({ design, data }: RenderFixture): string {
  const result = renderSvg(design, { data, expressions: testEvaluator });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}
