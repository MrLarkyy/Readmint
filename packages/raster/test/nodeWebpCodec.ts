import { initRaster } from "../src/initRaster.js";
import { openWebpCodec } from "../src/rasterRuntime.js";
import type { WebpCodec } from "../src/WebpCodec.js";

/** A libwebp instance, loading the rasterizer from node_modules first. */
export async function openNodeWebpCodec(): Promise<WebpCodec> {
  await initRaster();
  return openWebpCodec();
}
