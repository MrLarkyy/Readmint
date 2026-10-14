import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { GoldenSuite } from "../GoldenSuite.js";
import { GoldenStore } from "./GoldenStore.js";
import { checkNodeFixture, checkOrphans } from "./checkNodeFixture.js";
import { goldenMode } from "./goldenMode.js";

/** Registers one test per fixture plus an orphan check. `glueUrl` is the `<suite>.golden.test.ts` that calls it. */
export function goldenTest<I>(suite: GoldenSuite<I>, glueUrl: string): void {
  const store = GoldenStore.forSuiteFile(glueUrl);
  const mode = goldenMode();
  if (basename(store.goldenDir) !== suite.name) {
    throw new Error(`golden suite ${suite.name} must live in ${suite.name}.golden.ts`);
  }
  describe(`golden ${suite.name}`, () => {
    for (const fixture of suite.fixtures) {
      test(fixture.name, async () => {
        const { problems, artefacts } = await checkNodeFixture(suite, fixture, store, mode);
        expect(
          problems,
          [...problems, ...artefacts.map((path) => `artefact: ${path}`)].join("\n"),
        ).toEqual([]);
      });
    }
    test("no orphan goldens", () => {
      const { problems } = checkOrphans(suite, store, mode);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}
