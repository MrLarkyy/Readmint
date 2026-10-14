import { defineGoldenSuite } from "@readmint/golden";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { goldenFonts } from "./testAssets.js";

/** Static frames of the animated designs (`time` set): what raster export draws and what the browser plays. */
export default defineGoldenSuite<RenderFixture>({
  name: "renderer-animation",
  render: renderFixture,
  fonts: goldenFonts,
  fixtures: animationDesigns.flatMap(({ name, input, times }) =>
    times.map((time) => ({
      name: `${name}-t${String(time)}`,
      scale: 2,
      input: { ...input, time },
    })),
  ),
});
