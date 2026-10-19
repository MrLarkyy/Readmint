import { animatedProperties, DesignLimits, quoteInput } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";
import { sameJson } from "./sameJson.js";

/**
 * Sets the animation track of `property` on the layer at `pointer` to `track`, or removes it with `undefined`; the
 * layer's other tracks and properties are kept as they are, and `animate` goes when it is left empty. The property
 * must be one the layer's type can animate (compared as a string against the format's table, so no prototype name
 * passes); the keyframe count is checked before any keyframe is read. The format's validation checks the rest
 * (offsets, ranges, easing, cycles, the design's timeline). A track equal to the present one changes nothing. Refused,
 * the state is unchanged and the issue says why.
 */
export function setLayerTrack(
  state: EditorState,
  pointer: string,
  property: string,
  track: unknown,
): EditorState {
  const layer = findLayer(state.design, pointer);
  if (layer === undefined) return refuse(state, "design", "no layer to change here", pointer);
  const animatePath = childPointer(pointer, "animate");
  if (typeof property !== "string") {
    return refuse(state, "design", "the track property must be a name", animatePath);
  }
  if (!animatedProperties(layer.type).some((p) => p.property === property)) {
    return refuse(
      state,
      "design",
      `a ${layer.type} layer cannot animate ${quoteInput(property)}`,
      animatePath,
    );
  }
  const path = childPointer(animatePath, property);
  if (track !== undefined) {
    if (typeof track !== "object" || track === null || Array.isArray(track)) {
      return refuse(state, "design", "a track must be an object with keyframes", path);
    }
    const keyframes: unknown = Object.hasOwn(track, "keyframes")
      ? (track as { keyframes: unknown }).keyframes
      : undefined;
    if (!Array.isArray(keyframes)) {
      return refuse(
        state,
        "design",
        "a track needs a list of keyframes",
        childPointer(path, "keyframes"),
      );
    }
    if (
      keyframes.length < DesignLimits.minTrackKeyframes ||
      keyframes.length > DesignLimits.maxTrackKeyframes
    ) {
      return refuse(
        state,
        "design",
        `a track needs ${String(DesignLimits.minTrackKeyframes)} to ${String(DesignLimits.maxTrackKeyframes)} keyframes, got ${String(keyframes.length)}`,
        childPointer(path, "keyframes"),
      );
    }
  }
  const present = getAt(state.design, path);
  if (sameJson(track, present)) return commitDesign(state, state.design);
  const tracks = getAt(state.design, animatePath);
  const entries = Object.entries(
    typeof tracks === "object" && tracks !== null ? (tracks as Record<string, unknown>) : {},
  );
  const updated =
    track === undefined
      ? entries.filter(([name]) => name !== property)
      : entries.some(([name]) => name === property)
        ? entries.map(([name, item]) => [name, name === property ? track : item] as const)
        : [...entries, [property, track] as const];
  const next = setAt(
    state.design,
    animatePath,
    updated.length === 0 ? undefined : Object.fromEntries(updated),
  );
  if (next === undefined) return refuse(state, "design", "the track cannot be set here", path);
  return commitDesign(state, next);
}
