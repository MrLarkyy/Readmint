import { expect, test } from "vitest";
import { hostileFixtures } from "./hostileDesigns.js";
import { renderFixture } from "./renderFixture.js";

test.each(hostileFixtures.map((fixture) => [fixture.name, fixture.input] as const))(
  "Chromium parses %s as well-formed SVG without scripts",
  (_name, input) => {
    const document = new DOMParser().parseFromString(renderFixture(input), "image/svg+xml");
    expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(document.documentElement.localName).toBe("svg");
    expect(document.getElementsByTagName("script")).toHaveLength(0);
    expect(document.getElementsByTagName("foreignObject")).toHaveLength(0);
    expect(document.getElementsByTagName("style").length).toBeLessThanOrEqual(1);
    for (const element of Array.from(document.getElementsByTagName("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name).not.toMatch(/^on/u);
      }
    }
  },
);
