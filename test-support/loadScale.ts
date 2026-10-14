const SPIN_ROUNDS = 1_200_000;
const NOMINAL_MS = 1;
const MAX_SCALE = 20;

function spin(): number {
  let value = 1;
  for (let round = 0; round < SPIN_ROUNDS; round++) value = (Math.imul(value, 31) + round) | 0;
  return value;
}

const sink = { value: 0 };

/**
 * How much slower this machine is right now than idle, from 1 (idle) to 20. A wall-clock bound
 * is multiplied by it; call it right after the timed operation so it sees the same load. The
 * cap keeps a real blow-up (orders of magnitude) above any scaled limit.
 */
export function loadScale(): number {
  sink.value ^= spin();
  const times: number[] = [];
  for (let run = 0; run < 3; run++) {
    const started = performance.now();
    sink.value ^= spin();
    times.push(performance.now() - started);
  }
  const median = times.sort((x, y) => x - y)[1] ?? NOMINAL_MS;
  return Math.min(MAX_SCALE, Math.max(1, median / NOMINAL_MS));
}
