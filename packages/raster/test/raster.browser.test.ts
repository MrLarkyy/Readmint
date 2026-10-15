import resvgUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import webpUrl from "wasm-webp/dist/esm/webp-wasm.wasm?url";
import { expect, test } from "vitest";
import { exportRaster, initRaster } from "../src/browser.js";
import { parityCases, parityInput, parityKey, parityPins } from "./browserParity.js";

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function wasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cannot load ${url}`);
  return response.arrayBuffer();
}

test("Chromium exports every parity case to the bytes Node pins", async () => {
  await initRaster({ resvg: await wasm(resvgUrl), webp: await wasm(webpUrl) });
  for (const item of parityCases) {
    const output = await exportRaster(parityInput(item.design), {
      format: item.format,
      ...(item.name === "loop" ? { frameRate: 10 } : {}),
    });
    expect(await sha256(output.bytes), parityKey(item)).toBe(parityPins[parityKey(item)]);
  }
});
