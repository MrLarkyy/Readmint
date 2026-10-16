const SPIN_ROUNDS = 4_000_000;
const NOMINAL_MS = 3.3;
const MAX_SCALE = 20;

function spin(): number {
  let value = 1;
  for (let round = 0; round < SPIN_ROUNDS; round++) value = (Math.imul(value, 31) + round) | 0;
  return value;
}

const sink = { value: 0 };

/**
 * How much slower this machine is right now than idle, from 1 (idle) to 20. A wall-clock bound
 * is multiplied by it; call it right after the timed operation so it sees the same load, and also
 * before it when a load spike may end during the run (the larger value bounds it). The
 * cap keeps a real blow-up (orders of magnitude) above any scaled limit.
 */
export function loadScale(): number {
  sink.value ^= spin();
  const times: number[] = [];
  for (let run = 0; run < 5; run++) {
    const started = performance.now();
    sink.value ^= spin();
    times.push(performance.now() - started);
  }
  const slowest = Math.max(...times);
  return Math.min(MAX_SCALE, Math.max(1, slowest / NOMINAL_MS));
}

/**
 * Runs `run` and reports its wall-clock time with the load scale to bound it by. The scale is
 * the larger of a probe before and one after: a spike that ends during the run is missed by
 * the after-probe, one that starts during it by the before-probe. Only `run` is timed.
 */
export function timed<T>(run: () => T): { value: T; ms: number; scale: number } {
  const before = loadScale();
  const started = performance.now();
  const value = run();
  const ms = performance.now() - started;
  return { value, ms, scale: Math.max(before, loadScale()) };
}
