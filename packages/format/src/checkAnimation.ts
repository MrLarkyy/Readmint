import type { AnimationTrack, Design, Layer } from "./Design.js";
import type { IssueCollector } from "./IssueCollector.js";
import { jsonPointer } from "./jsonPointer.js";

type Tracks = Readonly<Record<string, AnimationTrack<unknown> | undefined>>;

/** Arc commands: their exact length needs trigonometry, so a path that draws itself on cannot use them. */
const arcCommand = /[Aa]/u;

/**
 * Checks of `animate` JSON Schema cannot express, on a structurally valid design, in document order: a layer animates
 * only on the design's timeline, keyframe offsets never decrease, and a `draw` track runs over path data without
 * arcs. Component definitions are checked like the document.
 */
export function checkAnimation(design: Design, issues: IssueCollector): void {
  const walker = { design, issues, timelineReported: false };
  for (const key of Object.keys(design)) {
    if (key === "layers") walkLayers(walker, design.layers, "/layers");
    else if (key === "components") {
      const components = design.components ?? {};
      for (const name of Object.keys(components)) {
        const definition = components[name];
        if (definition !== undefined)
          walkLayers(
            walker,
            definition.layers,
            jsonPointer(jsonPointer("/components", name), "layers"),
          );
      }
    }
  }
}

interface Walker {
  readonly design: Design;
  readonly issues: IssueCollector;
  timelineReported: boolean;
}

function walkLayers(walker: Walker, layers: readonly Layer[], path: string): void {
  layers.forEach((layer, index) => {
    if (walker.issues.isFull()) return;
    const at = jsonPointer(path, index);
    if (layer.animate !== undefined) checkLayer(walker, layer, at);
    if (layer.type === "group") walkLayers(walker, layer.children, jsonPointer(at, "children"));
  });
}

function checkLayer(walker: Walker, layer: Layer, path: string): void {
  if (walker.design.animation === undefined && !walker.timelineReported) {
    walker.timelineReported = true;
    walker.issues.add({
      path: "/animation",
      code: "missing-property",
      message: `the layer at ${path} animates, so the design needs an animation timeline`,
    });
  }
  const animatePath = jsonPointer(path, "animate");
  const tracks = layer.animate as Tracks;
  for (const property of Object.keys(tracks)) {
    const track = tracks[property];
    if (track === undefined) continue;
    const trackPath = jsonPointer(animatePath, property);
    checkOffsets(walker.issues, track, trackPath);
    if (property === "draw" && layer.type === "path" && arcCommand.test(layer.d)) {
      walker.issues.add({
        path: trackPath,
        code: "pattern",
        message: "a draw track needs path data without arc commands (A or a)",
      });
    }
  }
}

function checkOffsets(issues: IssueCollector, track: AnimationTrack<unknown>, path: string): void {
  let previous = 0;
  track.keyframes.forEach((keyframe, index) => {
    if (keyframe.offset < previous) {
      issues.add({
        path: jsonPointer(jsonPointer(jsonPointer(path, "keyframes"), index), "offset"),
        code: "range",
        message: `keyframe offsets must not decrease: ${String(keyframe.offset)} follows ${String(previous)}`,
      });
    }
    previous = Math.max(previous, keyframe.offset);
  });
}
