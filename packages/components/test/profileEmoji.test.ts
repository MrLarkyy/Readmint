import { describe, expect, test } from "vitest";
import { loadProfile, renderProfile } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

const rocket = "\u{1F680}";

function withStatus(message: string) {
  const data = sampleProfileData();
  return { github: { ...data.github, status: { emoji: null, message } } };
}

/** The x each translated slot of the status row starts at, in document order. */
function slotStarts(svg: string): number[] {
  return [...svg.matchAll(/translate\(([\d.]+) 0\)/gu)].map((match) => Number(match[1]));
}

describe("emoji no template font covers", () => {
  test("the pinscreen status row follows the drawn status, not its code point count", () => {
    const render = (message: string) =>
      renderProfile({
        template: "pinscreen",
        design: loadProfile("pinscreen", "header"),
        data: withStatus(message),
        expectWarnings: message.includes(rocket) ? ["missing-glyph"] : [],
      });
    const plain = slotStarts(render("ab"));
    const dropped = slotStarts(render(`ab${rocket}${rocket}${rocket}${rocket}`));
    expect(plain).toContain(131.8);
    expect(dropped).toEqual(plain);
  });

  test("the pinscreen status row keeps its place without a status", () => {
    const svg = renderProfile({
      template: "pinscreen",
      design: loadProfile("pinscreen", "header"),
      data: withStatus(""),
    });
    expect(slotStarts(svg)).toContain(118);
  });

  test("the pinscreen contact underline is sized by code points: the documented limit of a length estimate", () => {
    const design = loadProfile("pinscreen", "footer");
    const [root, ...rest] = design.layers;
    if (root?.type !== "component") throw new Error("the footer has no root component");
    const svg = renderProfile({
      template: "pinscreen",
      design: {
        ...design,
        layers: [{ ...root, props: { ...root.props, contactText: `hi ${rocket}` } }, ...rest],
      },
      data: sampleProfileData(),
      expectWarnings: ["missing-glyph"],
    });
    expect(svg).toContain('<rect x="806.4" y="92.25" width="33.6"');
  });
});
