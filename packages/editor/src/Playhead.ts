/**
 * Where the preview is on the design's timeline. Playing, the preview is the animated SVG, which starts at its
 * beginning whenever it is loaded, so the clock counts from `startedAt`; paused, `time` is the frame the preview shows.
 * Session state of the editor, never part of the design, the history or an export.
 */
export interface Playhead {
  readonly playing: boolean;
  /** Milliseconds on the timeline, an integer; where the clock started while playing, the shown frame when paused. */
  readonly time: number;
  /** The clock reading when playing began. */
  readonly startedAt: number;
}

/** Playing from the start of the timeline: how the editor opens and what the CLI renders without `--time`. */
export const startPlayhead: Playhead = Object.freeze({ playing: true, time: 0, startedAt: 0 });

function wholeMilliseconds(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(Math.round(time), 0), duration);
}

/** The position on the timeline `now` stands for: past the end it wraps with `loop`, else stays at the end. */
export function timeAt(playhead: Playhead, now: number, duration: number, loop: boolean): number {
  if (!playhead.playing) return wholeMilliseconds(playhead.time, duration);
  const elapsed = Math.max(0, now - playhead.startedAt);
  if (!loop) return wholeMilliseconds(playhead.time + elapsed, duration);
  return wholeMilliseconds((playhead.time + elapsed) % duration, duration);
}

/** Playing again from the start, as a freshly loaded animated SVG does. */
export function play(now: number): Playhead {
  return { playing: true, time: 0, startedAt: now };
}

/** Stopped at the position `now` stands for. */
export function pause(playhead: Playhead, now: number, duration: number, loop: boolean): Playhead {
  return { playing: false, time: timeAt(playhead, now, duration, loop), startedAt: now };
}

/** Stopped at `time`, rounded to whole milliseconds and kept within the timeline. */
export function seek(playhead: Playhead, time: number, duration: number): Playhead {
  return { playing: false, time: wholeMilliseconds(time, duration), startedAt: playhead.startedAt };
}
