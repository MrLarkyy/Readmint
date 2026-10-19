import type { LayerField } from "./LayerField.js";

/** One editable value of an orbit: where it lives under `orbit` and how it is edited. */
export interface OrbitField {
  /** The label and input name, e.g. `center.x`. */
  readonly label: string;
  /** The object holding the key, relative to `orbit`: "" or `center`. */
  readonly parent: "" | "center";
  readonly field: LayerField;
}

/** The scalar values of `Orbit` (`Design.ts`), in the order the panel lists them; `fade` is edited as a pair. */
export const orbitFields: readonly OrbitField[] = [
  { label: "center.x", parent: "center", field: { key: "x", kind: "number", required: true } },
  { label: "center.y", parent: "center", field: { key: "y", kind: "number", required: true } },
  { label: "radius", parent: "", field: { key: "radius", kind: "number", required: true } },
  { label: "radiusY", parent: "", field: { key: "radiusY", kind: "number" } },
  { label: "angle", parent: "", field: { key: "angle", kind: "number", required: true } },
  { label: "speed", parent: "", field: { key: "speed", kind: "number" } },
  { label: "upright", parent: "", field: { key: "upright", kind: "boolean" } },
];

/** The two numbers of `orbit.fade`. */
export const orbitFadeKeys = ["from", "to"] as const;

/** A new orbit: a circle of radius 0 at the origin, which the fields then move. */
export const newOrbit = Object.freeze({ center: { x: 0, y: 0 }, radius: 0, angle: 0 });
