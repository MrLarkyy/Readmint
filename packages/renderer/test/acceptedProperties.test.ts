import { animatedProperties, type Layer } from "@readmint/format";
import { expect, test } from "vitest";
import type { RenderNode } from "../src/RenderNode.js";
import { accepted } from "../src/resolveAnimation.js";

/** A `component` layer is drawn as a group node; every other layer type is drawn as the node of its own name. */
const nodeKind = (type: Layer["type"]): RenderNode["kind"] =>
  type === "component" ? "group" : type;

const layerTypes: readonly Layer["type"][] = [
  "group",
  "image",
  "component",
  "rect",
  "ellipse",
  "path",
  "text",
];

test.each(layerTypes)(
  "the renderer accepts on a %s exactly the tracks the format allows",
  (type) => {
    const allowed = animatedProperties(type)
      .map(({ property }) => property)
      .sort();
    expect([...accepted[nodeKind(type)]].sort()).toEqual(allowed);
  },
);
