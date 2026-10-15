/** A sampled frame and how long it shows, in the format's delay unit. */
export interface TimedFrame {
  /** Milliseconds on the timeline. */
  readonly time: number;
  readonly delay: number;
}

export interface DelayUnit {
  /** Milliseconds per unit: 1 for WebP and APNG, 10 for GIF. */
  readonly ms: number;
  /** Shortest delay players honour; a shorter frame merges into the one before it. */
  readonly min: number;
}

/**
 * Delays of the frames sampled at `times` (`frameTimes`), rounded cumulatively: each frame ends where the next
 * starts, both rounded on the timeline, so the delays add up to the duration exactly and never drift. A frame
 * shorter than `unit.min` is dropped and its time goes to the frame before it. The held end frame of a timeline that
 * does not loop (time = duration) shows one frame interval: only a player that ignores the play count shows it at
 * all before it stops.
 */
export function frameDelays(
  times: readonly number[],
  animation: { readonly duration: number; readonly loop: boolean },
  frameRate: number,
  unit: DelayUnit,
): TimedFrame[] {
  const boundary = (time: number): number => Math.round(time / unit.ms);
  const frames: { time: number; delay: number }[] = [];
  times.forEach((time, index) => {
    if (time >= animation.duration) {
      const interval = Math.max(unit.min, Math.round(1000 / frameRate / unit.ms));
      frames.push({ time, delay: interval });
      return;
    }
    const next = Math.min(times[index + 1] ?? animation.duration, animation.duration);
    const delay = boundary(next) - boundary(time);
    const last = frames.at(-1);
    if (delay < unit.min && last !== undefined) {
      last.delay += delay;
      return;
    }
    frames.push({ time, delay: Math.max(delay, unit.min) });
  });
  return frames;
}
