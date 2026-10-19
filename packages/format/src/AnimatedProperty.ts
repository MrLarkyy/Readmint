/** What a track's keyframe values are: the kind decides the range the format applies. */
export type TrackValueKind = "unit" | "position" | "scale" | "rotation" | "colour";

/** One property a layer can animate with a track under `animate`. */
export interface AnimatedProperty {
  readonly property: string;
  readonly value: TrackValueKind;
}
