import type { GoldenFixture, GoldenSuite } from "../GoldenSuite.js";
import { defaultBrowserTolerance, resolveTolerance } from "../GoldenTolerance.js";
import type { FixtureCheck } from "./FixtureCheck.js";
import { browserArtefactKinds, type GoldenStore } from "./GoldenStore.js";
import { comparePng } from "./comparePng.js";

/**
 * Compares what the browser produced with the Node render: the raw SVG must be byte-identical and the
 * browser raster must match the committed PNG golden within the browser tolerance. Never writes goldens.
 */
export function checkBrowserRender<I>(
  suite: GoldenSuite<I>,
  fixture: GoldenFixture<I>,
  store: GoldenStore,
  nodeSvg: string,
  browser: { svg: string; png: Uint8Array },
): FixtureCheck {
  const result: FixtureCheck = { problems: [], artefacts: [] };
  store.clearArtefacts(fixture.name, browserArtefactKinds);
  if (browser.svg !== nodeSvg) {
    result.problems.push(`${fixture.name}: browser SVG differs from the Node SVG`);
    result.artefacts.push(store.writeArtefact(fixture.name, "node.svg", nodeSvg));
    result.artefacts.push(store.writeArtefact(fixture.name, "browser.svg", browser.svg));
  }
  const path = store.pngPath(fixture.name);
  const golden = store.read(path);
  if (golden === undefined) {
    result.problems.push(
      `${fixture.name}: missing PNG golden ${path}; run pnpm golden:update ${suite.name}`,
    );
    return result;
  }
  const comparison = comparePng(
    golden,
    browser.png,
    resolveTolerance(suite.browserTolerance, defaultBrowserTolerance),
  );
  if (!comparison.pass) {
    const detail =
      comparison.reason ??
      `${String(comparison.diffPixels)} of ${String(comparison.totalPixels)} pixels differ`;
    result.problems.push(`${fixture.name}: browser raster differs from golden ${path} (${detail})`);
    result.artefacts.push(store.writeArtefact(fixture.name, "browser.png", browser.png));
    if (comparison.diffPng !== undefined) {
      result.artefacts.push(
        store.writeArtefact(fixture.name, "browser-diff.png", comparison.diffPng),
      );
    }
  }
  return result;
}
