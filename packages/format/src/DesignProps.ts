import type { ComponentPropValue } from "./Design.js";

/** A template's settings: root component props by section (the design's file stem without `.dark`). */
export type DesignProps = Readonly<Record<string, Readonly<Record<string, ComponentPropValue>>>>;
