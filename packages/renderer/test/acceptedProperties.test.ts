import { animatedProperties, type Layer } from "@readmint/format";
import { expect, test } from "vitest";
import type { RenderNode } from "../src/RenderNode.js";
import { accepted } from "../src/resolveAnimation.js";

/** A `component` layer is drawn as a group node; every other layer type is drawn as the node of its own name. */
const nodeKind = (type: Layer["type"]): RenderNode["kind"] =>
  type === "component" ? "group" : type;

/** Keyed by every layer type, so the compiler rejects this list when the format gains a type it does not name. */
const layerTypes = Object.keys({
  group: true,
  image: true,
  component: true,
  rect: true,
  ellipse: true,
  path: true,
  text: true,
} satisfies Record<Layer["type"], true>) as Layer["type"][];

test.each(layerTypes)(
  "the renderer accepts on a %s exactly the tracks the format allows",
  (type) => {
    const allowed = animatedProperties(type)
      .map(({ property }) => property)
      .sort();
    expect([...accepted[nodeKind(type)]].sort()).toEqual(allowed);
  },
);
