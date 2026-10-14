import { formatNumber } from "./formatNumber.js";
import { hexColour } from "./hexColour.js";
import {
  playGroups,
  type NodeAnimation,
  type TimelineKeyframe,
  type TrackTimeline,
} from "./NodeAnimation.js";
import type { SvgWriter } from "./SvgWriter.js";

/**
 * The CSS of one render's animations. Every animation of the render is registered before anything is drawn; `seal`
 * then names the document `r<hash>`, a hash of the rules themselves, and writes `@keyframes r<hash>k<n>` and classes
 * `.r<hash>a<n>` (the animations playing on one element). An SVG inlined into a page shares the page's style, so the
 * prefix keeps two different Readmint SVGs apart while the same design still gives the same bytes; the root `<svg>`
 * carries the prefix as its class, so the reduced-motion rule stops this document's animations only.
 *
 * Rules are deduplicated by their text and numbered in registration order, so identical copies of a repeat share them.
 * Tracks of one element with the same keyframe positions and easings share one `@keyframes`; keyframes in a row
 * holding the same value share one selector list (the easing of a held segment changes nothing). Only numbers from
 * `formatNumber`, `#rrggbb` colours and fixed words are written: no string from the design or the data reaches the
 * style.
 */
export class AnimationCss {
  private readonly keyframes = new Map<string, number>();
  private readonly classes = new Map<string, number>();
  private prefix: string | undefined;

  constructor(private readonly writer: SvgWriter) {}

  /** Registers the classes the node's animation will ask for, before `seal`. */
  register(animation: NodeAnimation): void {
    if (this.prefix !== undefined) throw new Error("animation CSS is already sealed");
    for (const tracks of playGroups(animation)) this.classKey(animation, tracks);
  }

  /**
   * Writes every registered rule under the document prefix and returns that prefix, the root class of the `<svg>`;
   * undefined when nothing animates.
   */
  seal(): string | undefined {
    if (this.classes.size === 0) return undefined;
    const keyframes = [...this.keyframes.keys()];
    const classes = [...this.classes.keys()];
    const prefix = `r${fnv1a([...keyframes, ...classes].join("\n"))}`;
    this.prefix = prefix;
    keyframes.forEach((body, index) => {
      this.writer.style(`@keyframes ${prefix}k${String(index)}{${body}}`);
    });
    classes.forEach((key, index) => {
      this.writer.style(
        `.${prefix}a${String(index)}{animation:${key.replaceAll("@k", `${prefix}k`)}}`,
      );
    });
    this.writer.style(
      `@media (prefers-reduced-motion:reduce){.${prefix} [class]{animation:none!important}}`,
    );
    return prefix;
  }

  /** The class playing `tracks` (of `animation`) together on one element; registered before `seal`. */
  className(animation: NodeAnimation, tracks: readonly TrackTimeline[]): string {
    const index = this.classes.get(this.classKey(animation, tracks));
    if (this.prefix === undefined || index === undefined)
      throw new Error("an animation was drawn that was not registered");
    return `${this.prefix}a${String(index)}`;
  }

  /** The class's `animation` value with `@k<n>` for the keyframes names, registering what is new. */
  private classKey(animation: NodeAnimation, tracks: readonly TrackTimeline[]): string {
    // No delay, so a looping animation needs no fill mode; one that plays once holds its end.
    const timing = `${String(animation.duration)}ms linear ${animation.loop ? "infinite" : "both"}`;
    const key = mergeable(tracks)
      .map((group) => `@k${String(this.keyframesIndex(group))} ${timing}`)
      .join(",");
    if (!this.classes.has(key)) {
      if (this.prefix !== undefined) return key;
      this.classes.set(key, this.classes.size);
    }
    return key;
  }

  private keyframesIndex(tracks: readonly TrackTimeline[]): number {
    const body = keyframesBody(tracks);
    let index = this.keyframes.get(body);
    if (index === undefined) {
      if (this.prefix !== undefined) return -1;
      index = this.keyframes.size;
      this.keyframes.set(body, index);
    }
    return index;
  }
}

function keyframesBody(tracks: readonly TrackTimeline[]): string {
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
  return body;
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

/** 32-bit FNV-1a of the UTF-16 units of `text`, in base 36 padded to 7 characters. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
