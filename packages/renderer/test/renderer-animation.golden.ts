import { defineGoldenSuite } from "@readmint/golden";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { goldenFonts } from "./testAssets.js";

/**
 * A rect with opacity sliding in from four canvas widths away: a frame leaves it out while it lies off the canvas
 * (resvg aborts on it beyond twice the canvas). Frames only: the animated SVG keeps it for CSS to move.
 */
const slideIn: RenderFixture = {
  design: {
    version: 0,
    canvas: { width: 160, height: 100, background: "#ffffff" },
    animation: { duration: 1000, loop: false },
    layers: [
      { type: "rect", x: 10, y: 10, width: 30, height: 20, fill: "#0969da" },
      {
        type: "rect",
        x: 20,
        y: 40,
        width: 60,
        height: 40,
        fill: "#8250df",
        opacity: 0.6,
        animate: {
          x: {
            keyframes: [
              { offset: 0, value: 640 },
              { offset: 1, value: 0 },
            ],
          },
        },
      },
    ],
  },
};

/** Static frames of the animated designs (`time` set): what raster export draws and what the browser plays. */
export default defineGoldenSuite<RenderFixture>({
  name: "renderer-animation",
  render: renderFixture,
  fonts: goldenFonts,
  fixtures: [
    ...animationDesigns.flatMap(({ name, input, times }) =>
      times.map((time) => ({
        name: `${name}-t${String(time)}`,
        scale: 2,
        input: { ...input, time },
      })),
    ),
    ...[0, 500, 1000].map((time) => ({
      name: `off-canvas-slide-in-t${String(time)}`,
      scale: 2,
      input: { ...slideIn, time },
    })),
  ],
});
