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
