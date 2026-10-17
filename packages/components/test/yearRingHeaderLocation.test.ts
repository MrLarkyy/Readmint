import { describe, expect, test } from "vitest";
import { loadExampleProfile, renderProfile, type ProfileTheme } from "./profileDesigns.js";
import { longLocationProfileData, worstCaseProfileData } from "./sampleProfileData.js";

const locations = {
  "64 characters": "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, Wales",
  "255 wide capitals": "W".repeat(255),
};

/** The baselines and the x of the last glyph of every text drawn before the header's rule (y=38) in the document. */
function strip(svg: string): { ys: string[]; lastX: number; text: string } {
  const rule = svg.indexOf('<rect x="0" y="38" width="840"');
  expect(rule).toBeGreaterThan(0);
  const spans = [
    ...svg.slice(0, rule).matchAll(/<tspan x="([^"]*)" y="([^"]*)"[^>]*>([^<]*)<\/tspan>/g),
  ].map((match) => ({
    xs: (match[1] ?? "").split(" ").map(Number),
    y: match[2] ?? "",
    text: match[3] ?? "",
  }));
  const last = spans[spans.length - 1];
  return {
    ys: spans.map((span) => span.y),
    lastX: last?.xs[last.xs.length - 1] ?? Number.NaN,
    text: last?.text ?? "",
  };
}

/** The x of the first and last glyph of the strip's two texts, left (login) then right (location and date). */
function bounds(svg: string): { ys: string[]; leftEnd: number; rightStart: number } {
  const rule = svg.indexOf('<rect x="0" y="38" width="840"');
  const spans = [...svg.slice(0, rule).matchAll(/<tspan x="([^"]*)" y="([^"]*)"/g)].map(
    (match) => ({
      xs: (match[1] ?? "").split(" ").map(Number),
      y: match[2] ?? "",
    }),
  );
  const [left, right] = spans;
  return {
    ys: spans.map((span) => span.y),
    leftEnd: left?.xs[left.xs.length - 1] ?? Number.NaN,
    rightStart: right?.xs[0] ?? Number.NaN,
  };
}

describe("year ring header login", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the longest login ends before the widest location`, () => {
      const data = worstCaseProfileData();
      const svg = renderProfile({
        template: "year-ring",
        design: loadExampleProfile("year-ring", "header", theme),
        data: { github: { ...data.github, location: "W".repeat(255) } },
      });
      const { ys, leftEnd, rightStart } = bounds(svg);
      expect(ys).toEqual(["22", "22"]);
      expect(leftEnd + 10).toBeLessThan(rightStart);
    });
  }
});

describe("year ring header location", () => {
  for (const [name, location] of Object.entries(locations)) {
    test(`${name}: one line with the date intact, clear of the rule`, () => {
      const svgs = (["light", "dark"] as const).map((theme: ProfileTheme) =>
        renderProfile({
          template: "year-ring",
          design: loadExampleProfile("year-ring", "header", theme),
          data: longLocationProfileData(location),
        }),
      );
      const [light, dark] = svgs.map(strip);
      expect(light?.ys).toEqual(["22", "22"]);
      expect(light?.text).toMatch(/….* · \d{1,2} [A-Z]{3} \d{4}$/);
      expect(light?.lastX).toBeLessThan(840);
      expect(dark?.ys).toEqual(light?.ys);
      expect(dark?.lastX).toBe(light?.lastX);
      expect(dark?.text).toBe(light?.text);
    });
  }
});
