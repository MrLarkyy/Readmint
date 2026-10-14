import { formatNumber } from "./formatNumber.js";
import type { NodeAnimation, TimelineKeyframe, TrackTimeline } from "./NodeAnimation.js";
import type { SvgWriter } from "./SvgWriter.js";

/** Stops every animation for readers who ask for less motion; they see the static attributes, frame 0. */
export const reducedMotionRule =
  "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

/**
 * The CSS of one render's animations: `@keyframes k<n>` and `.a<n>` (the animations of one element), deduplicated by
 * their text and named in creation order, so identical copies of a repeat share their rules. Tracks of one element
 * with the same keyframe positions and easings share one `@keyframes`; keyframes in a row holding the same value
 * share one selector list (the easing of a held segment changes nothing). Only numbers from `formatNumber`, `#rrggbb`
 * colours and fixed words are written: no string from the design or the data reaches the style.
 */
export class AnimationCss {
  private readonly keyframes = new Map<string, string>();
  private readonly classes = new Map<string, string>();

  constructor(private readonly writer: SvgWriter) {}

  /** The class playing `tracks` (of `animation`) together on one element. */
  className(animation: NodeAnimation, tracks: readonly TrackTimeline[]): string {
    // No delay, so a looping animation needs no fill mode; one that plays once holds its end.
    const timing = `${String(animation.duration)}ms linear ${animation.loop ? "infinite" : "both"}`;
    const names = mergeable(tracks).map((group) => `${this.keyframesName(group)} ${timing}`);
    const body = `animation:${names.join(",")}`;
    let name = this.classes.get(body);
    if (name === undefined) {
      name = this.writer.id("a");
      if (this.classes.size === 0) this.writer.style(reducedMotionRule);
      this.classes.set(body, name);
      this.writer.style(`.${name}{${body}}`);
    }
    return name;
  }

  private keyframesName(tracks: readonly TrackTimeline[]): string {
    const [first] = tracks;
    if (first === undefined) throw new Error("a keyframes rule has tracks");
    const rows = first.keyframes.map((keyframe, index) => ({
      selector: `${formatNumber(keyframe.position / 1000)}%`,
      declarations: tracks
        .map((track) => declarations(track, track.keyframes[index] ?? keyframe))
        .join(";"),
      easing: keyframe.easing,
    }));
    let body = "";
    for (let start = 0; start < rows.length;) {
      let end = start;
      while (rows[end + 1]?.declarations === rows[start]?.declarations) end++;
      const group = rows.slice(start, end + 1);
      const last = group.at(-1);
      const easing =
        end === rows.length - 1 || last?.easing.points === undefined
          ? ""
          : `;animation-timing-function:${last.easing.css}`;
      body += `${group.map((row) => row.selector).join(",")}{${last?.declarations ?? ""}${easing}}`;
      start = end + 1;
    }
    let name = this.keyframes.get(body);
    if (name === undefined) {
      name = this.writer.id("k");
      this.keyframes.set(body, name);
      this.writer.style(`@keyframes ${name}{${body}}`);
    }
    return name;
  }
}

/** Tracks in groups that can share one `@keyframes`: equal positions and easings, first appearance order. */
function mergeable(tracks: readonly TrackTimeline[]): TrackTimeline[][] {
  const groups = new Map<string, TrackTimeline[]>();
  for (const track of tracks) {
    const key = track.keyframes
      .map((keyframe) => `${String(keyframe.position)} ${keyframe.easing.css}`)
      .join(",");
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [track]);
    else group.push(track);
  }
  return [...groups.values()];
}

function declarations(track: TrackTimeline, keyframe: TimelineKeyframe): string {
  const [first = 0] = keyframe.value;
  const number = formatNumber(first);
  switch (track.property) {
    case "opacity":
      return `opacity:${number}`;
    case "fill":
    case "stroke": {
      const opacity = track.alpha
        ? `;${track.property}-opacity:${formatNumber(keyframe.value[3] ?? 1)}`
        : "";
      return `${track.property}:${hexColour(keyframe.value)}${opacity}`;
    }
    case "draw":
      return `stroke-dashoffset:${number}px`;
    case "x":
      return `transform:translate(${number}px,0px)`;
    case "y":
      return `transform:translate(0px,${number}px)`;
    case "rotation":
      return `transform:rotate(${number}deg)`;
    case "scale":
      return `transform:scale(${number})`;
  }
}

/** `#rrggbb` of integer channels in 0..255. */
export function hexColour(value: readonly number[]): string {
  return `#${value
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}
