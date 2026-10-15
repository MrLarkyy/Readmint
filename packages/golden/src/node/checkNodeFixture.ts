import type { GoldenFixture, GoldenSuite } from "../GoldenSuite.js";
import { defaultNodeTolerance, resolveTolerance } from "../GoldenTolerance.js";
import type { FixtureCheck } from "./FixtureCheck.js";
import { nodeArtefactKinds, type GoldenStore } from "./GoldenStore.js";
import type { GoldenMode } from "./goldenMode.js";
import { comparePng, maxPngSide } from "./comparePng.js";
import { normalizeSvg } from "./normalizeSvg.js";
import { rasterizeSvg } from "./rasterizeSvg.js";

/** Renders a fixture, checks it against its goldens and, in update mode only, writes the goldens. */
export async function checkNodeFixture<I>(
  suite: GoldenSuite<I>,
  fixture: GoldenFixture<I>,
  store: GoldenStore,
  mode: GoldenMode,
): Promise<FixtureCheck> {
  const result: FixtureCheck = { problems: [], artefacts: [] };
  store.clearArtefacts(fixture.name, nodeArtefactKinds);
  const first = await suite.render(fixture.input);
  const second = await suite.render(fixture.input);
  if (first !== second) {
    result.problems.push(`${fixture.name}: render is not deterministic (two renders differ)`);
    result.artefacts.push(store.writeArtefact(fixture.name, "actual.svg", first));
    return result;
  }
  checkSnapshot(suite, fixture, first, store, mode, result);
  checkRaster(suite, fixture, first, store, mode, result);
  return result;
}

function updateHint(suite: { name: string }): string {
  return `run pnpm golden:update ${suite.name}`;
}

function checkSnapshot<I>(
  suite: GoldenSuite<I>,
  fixture: GoldenFixture<I>,
  svg: string,
  store: GoldenStore,
  mode: GoldenMode,
  result: FixtureCheck,
): void {
  const path = store.svgPath(fixture.name);
  const actual = normalizeSvg(svg, suite.precision);
  const golden = store.read(path);
  if (golden?.toString("utf8") === actual) return;
  if (mode === "update") {
    store.writeIfChanged(path, actual);
    result.artefacts.push(path);
    return;
  }
  if (golden === undefined) {
    result.problems.push(`${fixture.name}: missing SVG snapshot ${path}; ${updateHint(suite)}`);
  } else {
    result.problems.push(
      `${fixture.name}: SVG differs from snapshot ${path}; if intended, ${updateHint(suite)}`,
    );
  }
  result.artefacts.push(store.writeArtefact(fixture.name, "actual.svg", actual));
}

function checkRaster<I>(
  suite: GoldenSuite<I>,
  fixture: GoldenFixture<I>,
  svg: string,
  store: GoldenStore,
  mode: GoldenMode,
  result: FixtureCheck,
): void {
  const path = store.pngPath(fixture.name);
  const png =
    suite.fontsFromSvg === undefined
      ? rasterizeSvg(svg, fixture.scale ?? 1, suite.fonts)
      : rasterizeSvg(svg, fixture.scale ?? 1, [], suite.fontsFromSvg(svg));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > maxPngSide || height > maxPngSide) {
    result.problems.push(
      `${fixture.name}: rendered PNG ${String(width)}x${String(height)} at scale ${String(fixture.scale ?? 1)} exceeds ${String(maxPngSide)}x${String(maxPngSide)}; lower the scale`,
    );
    return;
  }
  const golden = store.read(path);
  const tolerance = resolveTolerance(suite.tolerance, defaultNodeTolerance);
  const comparison = golden === undefined ? undefined : comparePng(golden, png, tolerance);
  if (comparison?.pass === true) return;
  if (mode === "update") {
    store.writeIfChanged(path, png);
    result.artefacts.push(path);
    return;
  }
  if (comparison === undefined) {
    result.problems.push(`${fixture.name}: missing PNG golden ${path}; ${updateHint(suite)}`);
  } else {
    const detail =
      comparison.reason ??
      `${String(comparison.diffPixels)} of ${String(comparison.totalPixels)} pixels differ`;
    result.problems.push(
      `${fixture.name}: PNG differs from golden ${path} (${detail}); if intended, ${updateHint(suite)}`,
    );
  }
  result.artefacts.push(store.writeArtefact(fixture.name, "actual.png", png));
  if (comparison?.diffPng !== undefined) {
    result.artefacts.push(store.writeArtefact(fixture.name, "diff.png", comparison.diffPng));
  }
}

/** Golden files that no fixture owns: an error in check mode, removed in update mode. */
export function checkOrphans<I>(
  suite: GoldenSuite<I>,
  store: GoldenStore,
  mode: GoldenMode,
): FixtureCheck {
  const names = suite.fixtures.map((fixture) => fixture.name);
  if (mode === "update") return { problems: [], artefacts: store.removeOrphans(names) };
  const orphans = store.orphans(names);
  return {
    problems: orphans.map((path) => `orphan golden ${path} has no fixture; ${updateHint(suite)}`),
    artefacts: [],
  };
}
