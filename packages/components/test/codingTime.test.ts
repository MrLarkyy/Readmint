import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDesignAsync, stringifyDesignYamlAsync, validateDesign } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { codingTimeTemplates } from "../src/index.js";
import { codingTimeSources, loadCodingTime } from "./codingTimeDesigns.js";
import { emptyWakaTimeData, longWakaTimeData, sampleWakaTimeData } from "./sampleWakaTimeData.js";
import { renderTemplate, withRootProps } from "./templateDesigns.js";

const templates = join(import.meta.dirname, "..", "templates");

/** UTF-8 bytes a coding-time template may take on the longest data (docs/components.md): the starter budget. */
const sizeBudget = 524_288;

const halvedLimits = {
  maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
  maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
};

const utf8Bytes = (svg: string) => new TextEncoder().encode(svg).length;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const languageBars = (svg: string) => svg.match(/<rect [^>]*height="6"/gu)?.length ?? 0;

describe.each(codingTimeTemplates)("%s", (name) => {
  test("validates with no issues", () => {
    expect(validateDesign(JSON.parse(codingTimeSources[name]))).toMatchObject({ ok: true });
  });

  test("has a transparent canvas and a theme enum on its one root instance", () => {
    const design = loadCodingTime(name);
    expect(design.canvas.background).toBeUndefined();
    expect(design.layers).toHaveLength(1);
    const [root] = design.layers;
    if (root?.type !== "component") throw new Error("the root layer is not a component");
    expect(root.props).toEqual({ theme: "light" });
    expect(design.components?.[root.ref]?.props?.["theme"]).toEqual({
      type: "enum",
      values: ["light", "dark"],
      default: "light",
    });
  });

  test("names only fonts of templates/fonts, embeddable under a licence kept beside them", () => {
    const readme = readFileSync(join(templates, "fonts", "README.md"), "utf8");
    const fonts = Object.entries(loadCodingTime(name).assets?.fonts ?? {});
    expect(fonts.length).toBeGreaterThan(0);
    for (const [id, font] of fonts) {
      expect(font.src, id).toMatch(/^fonts\/[A-Za-z0-9-]+\.ttf$/u);
      expect(font.licence, id).toEqual({ embedding: "allowed", name: "OFL-1.1" });
      expect(existsSync(join(templates, font.src)), id).toBe(true);
      expect(readme, id).toContain(sha256(readFileSync(join(templates, font.src))));
    }
  });

  test.each(["light", "dark"] as const)(
    "renders the sample in the %s theme, the same bytes twice",
    (theme) => {
      const render = () =>
        renderTemplate({
          design: withRootProps(loadCodingTime(name), { theme }),
          data: sampleWakaTimeData(),
        });
      const svg = render();
      expect(render()).toBe(svg);
      expect(svg).toContain(theme === "dark" ? "#0d1117" : "#ffffff");
      expect(svg).not.toContain(theme === "dark" ? "#ffffff" : "#0d1117");
    },
  );

  test("the SVG has no script, no event attribute and only data: references", () => {
    const data = sampleWakaTimeData();
    const hostile = '<script>alert(1)</script>&"';
    data.wakatime = {
      ...data.wakatime,
      humanReadableTotal: "<img onerror=x>",
      languages: [{ name: hostile, percent: 100, seconds: 1 }],
      editors: [{ name: "<a href=x onclick=y>", percent: 100, seconds: 1 }],
    };
    const svg = renderTemplate({ design: loadCodingTime(name), data });
    expect(svg).not.toMatch(/<script|<image|<foreignObject|<[^>]*\son[a-z]+=/iu);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
      /https?:|file:|@import/iu,
    );
    for (const [, target] of svg.matchAll(/href="([^"]*)"/gu)) {
      expect(target).toMatch(/^data:/u);
    }
  });

  test("stays within the budget and half the work limits on the longest data", () => {
    const svg = renderTemplate({
      design: loadCodingTime(name),
      data: longWakaTimeData(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(sizeBudget);
  });

  test("an unknown theme is an enum issue at the prop", () => {
    const result = validateDesign(withRootProps(loadCodingTime(name), { theme: "sepia" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: "/layers/0/props/theme", code: "enum" }),
      );
    }
  });

  test("re-imports from its YAML export to a deep-equal design", async () => {
    const design = loadCodingTime(name);
    const yaml = await stringifyDesignYamlAsync(design);
    if (!yaml.ok) throw new Error(JSON.stringify(yaml.issues));
    expect(await parseDesignAsync(yaml.value, { format: "yaml" })).toEqual({
      ok: true,
      value: design,
    });
  });

  test("its description is for a reader of the image, not the author", () => {
    const description = loadCodingTime(name).description ?? "";
    expect(description).not.toMatch(/theme|prop|assets|src|licence/u);
    expect(description.length).toBeGreaterThan(20);
  });
});

test("the card shows the top five languages, three editors and three systems", () => {
  const svg = renderTemplate({
    design: loadCodingTime("coding-time-card"),
    data: longWakaTimeData(),
  });
  expect(languageBars(svg)).toBe(10);
  for (const shown of ["Editor 3 ", "System 3 "]) expect(svg).toContain(shown);
  for (const hidden of ["Language 6 ", "Editor 4 ", "System 4 "]) expect(svg).not.toContain(hidden);
  expect(svg).toContain("All time");
});

test("the sample shows its total, the daily average, the range and the shares", () => {
  const svg = renderTemplate({
    design: loadCodingTime("coding-time-card"),
    data: sampleWakaTimeData(),
  });
  for (const text of [
    "27 hrs 26 mins",
    "3.9 hrs a day on average",
    "Last 7 days",
    "TypeScript",
    "53.0%",
    "30.5%",
    "60%",
    "40%",
    "VS Code",
    "Windows",
    "100%",
  ]) {
    expect(svg).toContain(text);
  }
  expect(languageBars(svg)).toBe(10);
  expect(svg).not.toContain("No coding time yet.");
});

test("empty data shows the empty states and zero time", () => {
  const svg = renderTemplate({
    design: loadCodingTime("coding-time-card"),
    data: emptyWakaTimeData(),
  });
  expect(svg).toContain("No coding time yet.");
  expect(svg.match(/No data yet\./gu)).toHaveLength(2);
  expect(svg).toContain("0 secs");
  expect(svg).toContain("Last 30 days");
  expect(languageBars(svg)).toBe(0);
});
