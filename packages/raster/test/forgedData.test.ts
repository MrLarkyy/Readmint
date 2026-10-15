import type { Design } from "@readmint/format";
import { comparePng, rasterizeSvg } from "@readmint/golden/node";
import { defaultNodeTolerance } from "@readmint/golden";
import { renderSvg } from "@readmint/renderer";
import { expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { openWebpCodec } from "../src/initRaster.js";
import { rasterFonts } from "../src/rasterFonts.js";
import { dataUri, fontBytes, fontPath } from "./rasterFixtures.js";

function boundText(value: string): { design: Design; data: Record<string, unknown> } {
  return {
    design: {
      version: 0,
      canvas: { width: 600, height: 40, background: "#ffffff" },
      assets: {
        fonts: {
          body: {
            family: "Montserrat",
            src: dataUri("font/ttf", fontBytes),
            weight: 500,
            licence: { embedding: "allowed", name: "OFL-1.1" },
          },
        },
      },
      layers: [{ type: "text", x: 4, y: 8, content: "{{s}}", font: "body", fontSize: 8 }],
    },
    data: { s: value },
  };
}

test("data URIs in a data-bound text are text: nothing is decoded, swapped or drawn with", async () => {
  const codec = await openWebpCodec();
  const webp = dataUri(
    "image/webp",
    codec.encodeWebp({ data: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1 }),
  );
  const forged = `${webp} url(data:font/woff2;base64,AAAA) url(data:font/ttf;base64,AAEAAAAA)`;
  const { design, data } = boundText(forged);
  const result = renderSvg(design, { data });
  if (!result.ok) throw new Error("the design does not render");
  expect(result.svg).toContain(webp);
  expect(rasterFonts(result.svg)).toHaveLength(1);
  const output = await exportRaster({ frame: () => result.svg }, { format: "png", scale: 1 });
  const reference = rasterizeSvg(result.svg, 1, [fontPath]);
  const comparison = comparePng(reference, output.bytes, defaultNodeTolerance);
  expect(comparison.pass, `${String(comparison.diffPixels)} pixels differ`).toBe(true);
});
