export interface GoldenTolerance {
  /** pixelmatch colour distance (0..1) above which a pixel counts as different. */
  threshold: number;
  /** Share of differing pixels (0..1) tolerated before the comparison fails. */
  maxDiffRatio: number;
  /** Count anti-aliased pixels as differences; off so goldens stay portable across platforms. */
  includeAA: boolean;
  /** Largest luma ink change of any 16 px tile, as a share of the tile (0..1); 1 turns the check off. */
  maxTileInk: number;
}

export const defaultNodeTolerance: GoldenTolerance = {
  threshold: 0.1,
  maxDiffRatio: 0,
  includeAA: false,
  maxTileInk: 0.001,
};

export const defaultBrowserTolerance: GoldenTolerance = {
  threshold: 0.2,
  maxDiffRatio: 0.01,
  includeAA: false,
  // Chromium and resvg differ by about 2 % ink per tile, more than a dropped small label.
  maxTileInk: 1,
};

export function resolveTolerance(
  given: Partial<GoldenTolerance> | undefined,
  defaults: GoldenTolerance,
): GoldenTolerance {
  const tolerance = { ...defaults, ...given };
  assertRatio("threshold", tolerance.threshold);
  assertRatio("maxDiffRatio", tolerance.maxDiffRatio);
  assertRatio("maxTileInk", tolerance.maxTileInk);
  return tolerance;
}

function assertRatio(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`golden tolerance ${name} must be between 0 and 1, got ${String(value)}`);
  }
}
