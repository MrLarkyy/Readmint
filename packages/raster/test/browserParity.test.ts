import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { exportRaster, initRaster } from "../src/browser.js";
import { resolveRasterWasm } from "../src/RasterWasm.js";
import { parityCases, parityInput, parityKey, parityPins } from "./browserParity.js";

test.each(parityCases.map((item) => [parityKey(item), item] as const))(
  "the browser entry exports %s to the pinned bytes",
  async (key, item) => {
    const paths = resolveRasterWasm();
    await initRaster({ resvg: await readFile(paths.resvg), webp: await readFile(paths.webp) });
    const output = await exportRaster(parityInput(item.design), {
      format: item.format,
      ...(item.name === "loop" ? { frameRate: 10 } : {}),
    });
    const sha = createHash("sha256").update(output.bytes).digest("hex");
    expect(sha).toBe(parityPins[key]);
  },
);
