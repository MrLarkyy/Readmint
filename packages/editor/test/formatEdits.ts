import type { Design } from "@readmint/format";
import { createEditorState, type EditorState } from "../src/index.js";

/** A rect with a `let`, an `animate` and an `orbit`, over a two-mode palette it reads. */
export const editDesign: Design = {
  version: 0,
  canvas: { width: 200, height: 100, background: "{{ palette.bg }}" },
  palette: {
    light: { bg: "#ffffff", ink: "#1f2328" },
    dark: { bg: "#0d1117", ink: "#e6edf3" },
  },
  animation: { duration: 1000 },
  layers: [
    {
      type: "group",
      width: 200,
      height: 100,
      children: [
        {
          type: "rect",
          width: 20,
          height: 10,
          fill: "{{ palette.ink }}",
          let: { a: "{{ 1 }}", b: "{{ a + 1 }}" },
          animate: {
            x: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 1 },
              ],
              cycles: 3,
            },
          },
          orbit: { center: { x: 100, y: 50 }, radius: 30, angle: 10 },
        },
      ],
    },
  ],
} as unknown as Design;

export const rectPointer = "/layers/0/children/0";

export function editState(): EditorState {
  return createEditorState(editDesign);
}
