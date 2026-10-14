import { expect, test } from "vitest";
import { animatedSnapshot } from "./animatedSnapshot.js";
import { animationDesigns } from "./animationDesigns.js";

// A folder of its own: the golden suite's orphan check owns golden/renderer-animation.
test.each(animationDesigns.map(({ name }) => name))(
  "the animated SVG of %s matches its snapshot",
  async (name) => {
    await expect(animatedSnapshot(name)).toMatchFileSnapshot(
      `golden/renderer-animation-svg/${name}.svg`,
    );
  },
);
