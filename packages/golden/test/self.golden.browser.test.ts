import { commands } from "vitest/browser";
import { expect, test } from "vitest";
import { goldenBrowserTest, rasterizeInBrowser } from "../src/browser/index.js";
import suite from "./self.golden.js";

goldenBrowserTest(suite);

test("a pixel change reaches the Node side as a problem with a diff artefact", async () => {
  const fixture = suite.fixtures[0] as (typeof suite.fixtures)[number];
  const altered = fixture.input.replace(
    "</svg>",
    '<rect width="64" height="32" fill="#000"/></svg>',
  );
  const pngBase64 = await rasterizeInBrowser(altered);

  const failed = await commands.goldenBrowserCheck({
    fixture: fixture.name,
    svg: fixture.input,
    pngBase64,
  });
  expect(failed.problems.join("\n")).toContain("browser raster differs");
  expect(failed.artefacts.some((path) => path.endsWith(`${fixture.name}.browser-diff.png`))).toBe(
    true,
  );

  const restored = await commands.goldenBrowserCheck({
    fixture: fixture.name,
    svg: fixture.input,
    pngBase64: await rasterizeInBrowser(fixture.input),
  });
  expect(restored.problems).toEqual([]);
});

test("a browser SVG that differs from the Node SVG is reported", async () => {
  const fixture = suite.fixtures[0] as (typeof suite.fixtures)[number];
  const result = await commands.goldenBrowserCheck({
    fixture: fixture.name,
    svg: `${fixture.input}\n`,
    pngBase64: await rasterizeInBrowser(fixture.input),
  });
  expect(result.problems.join("\n")).toContain("browser SVG differs");
  const restored = await commands.goldenBrowserCheck({
    fixture: fixture.name,
    svg: fixture.input,
    pngBase64: await rasterizeInBrowser(fixture.input),
  });
  expect(restored.problems).toEqual([]);
});

test("an unknown fixture is refused", async () => {
  await expect(
    commands.goldenBrowserCheck({ fixture: "nope", svg: "", pngBase64: "" }),
  ).rejects.toThrow(/no fixture/);
});
