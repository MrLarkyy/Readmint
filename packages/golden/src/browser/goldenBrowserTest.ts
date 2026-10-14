import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";
import type { GoldenSuite } from "../GoldenSuite.js";
import type { GoldenBrowserRequest, GoldenBrowserResult } from "../vitest/GoldenBrowserRequest.js";
import { rasterizeInBrowser } from "./rasterizeInBrowser.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    goldenBrowserCheck: (request: GoldenBrowserRequest) => Promise<GoldenBrowserResult>;
  }
}

/** Renders every fixture in the browser and lets the Node side compare it with the Node render and the golden. */
export function goldenBrowserTest<I>(suite: GoldenSuite<I>): void {
  describe(`golden ${suite.name} in the browser`, () => {
    for (const fixture of suite.fixtures) {
      test(fixture.name, async () => {
        const svg = await suite.render(fixture.input);
        const pngBase64 = await rasterizeInBrowser(svg, fixture.scale ?? 1);
        const { problems, artefacts } = await commands.goldenBrowserCheck({
          fixture: fixture.name,
          svg,
          pngBase64,
        });
        expect(
          problems,
          [...problems, ...artefacts.map((path) => `artefact: ${path}`)].join("\n"),
        ).toEqual([]);
      });
    }
  });
}
