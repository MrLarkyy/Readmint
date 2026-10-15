import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, expect, test } from "vitest";
import { rasterCodecs } from "../src/initRaster.js";
import { rasterizeFrame } from "../src/rasterizeFrame.js";
import { decodePng } from "./decodeRaster.js";

beforeAll(async () => {
  await rasterCodecs();
});

test("demultiplied pixels equal resvg's own PNG output exactly", () => {
  const stops = Array.from(
    { length: 9 },
    (_, index) =>
      `<stop offset="${String(index / 8)}" stop-color="#${(0x13579b + index * 0x1f2e3d).toString(16).slice(-6)}" stop-opacity="${String(index / 8)}"/>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="16"><linearGradient id="g">${stops}</linearGradient><rect width="64" height="16" fill="url(#g)"/><circle cx="20" cy="8" r="7" fill="#ff8040" fill-opacity="0.3"/></svg>`;
  const ours = rasterizeFrame(svg, 2, []);
  const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: 2 } });
  const image = resvg.render();
  const theirs = decodePng(image.asPng());
  image.free();
  resvg.free();
  expect([ours.width, ours.height]).toEqual([128, 32]);
  expect(Buffer.from(ours.data).equals(theirs)).toBe(true);
});
