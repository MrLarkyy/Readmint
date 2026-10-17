import type { Design, Layer } from "./Design.js";
import type { IssueCollector } from "./IssueCollector.js";
import { jsonPointer } from "./jsonPointer.js";

/**
 * Checks of `orbit` JSON Schema cannot express, on a structurally valid design, in document order: an orbit places
 * its layer itself, so the layer is no direct child of a stack or grid group; a `speed` needs the design's timeline
 * (reported once at `/animation`, unless the animation check reported it already); a fade needs `from` and `to` to
 * differ and owns the layer's opacity track, so it never comes with `animate.opacity`. Component definitions are
 * checked like the document.
 */
export function checkOrbit(design: Design, issues: IssueCollector): void {
  const walker: Walker = { design, issues, timelineReported: false };
  for (const key of Object.keys(design)) {
    if (key === "layers") walkLayers(walker, design.layers, "/layers", false);
    else if (key === "components") {
      const components = design.components ?? {};
      for (const name of Object.keys(components)) {
        const definition = components[name];
        if (definition !== undefined)
          walkLayers(
            walker,
            definition.layers,
            jsonPointer(jsonPointer("/components", name), "layers"),
            false,
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

function walkLayers(
  walker: Walker,
  layers: readonly Layer[],
  path: string,
  laidOut: boolean,
): void {
  layers.forEach((layer, index) => {
    if (walker.issues.isFull()) return;
    const at = jsonPointer(path, index);
    if (layer.orbit !== undefined) checkLayer(walker, layer, at, laidOut);
    if (layer.type === "group") {
      const type = layer.layout?.type;
      walkLayers(
        walker,
        layer.children,
        jsonPointer(at, "children"),
        type === "stack" || type === "grid",
      );
    }
  });
}

function checkLayer(walker: Walker, layer: Layer, path: string, laidOut: boolean): void {
  const orbit = layer.orbit;
  if (orbit === undefined) return;
  const orbitPath = jsonPointer(path, "orbit");
  if (laidOut) {
    walker.issues.add({
      path: orbitPath,
      code: "type",
      message: "an orbit places its layer itself, so the layer cannot be in a stack or grid group",
    });
  }
  if (orbit.speed !== undefined && walker.design.animation === undefined)
    reportTimeline(walker, path);
  const fade = orbit.fade;
  if (fade === undefined) return;
  const fadePath = jsonPointer(orbitPath, "fade");
  if (fade.from === fade.to) {
    walker.issues.add({
      path: jsonPointer(fadePath, "to"),
      code: "range",
      message: "a fade needs different from and to depths",
    });
  }
  if (layer.animate?.opacity !== undefined) {
    walker.issues.add({
      path: fadePath,
      code: "type",
      message: "a fade sets the layer's opacity track, so the layer cannot animate opacity too",
    });
  }
}

function reportTimeline(walker: Walker, path: string): void {
  if (walker.timelineReported) return;
  walker.timelineReported = true;
  const reported = walker.issues.issues.some(
    (issue) => issue.path === "/animation" && issue.code === "missing-property",
  );
  if (reported) return;
  walker.issues.add({
    path: "/animation",
    code: "missing-property",
    message: `the orbit at ${path} has a speed, so the design needs an animation timeline`,
  });
}
