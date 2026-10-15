import { describe, expect, test } from "vitest";
import { sniffImage } from "../src/sniffImage.js";
import gradientJpeg from "./assets/gradient.jpg?inline";
import { dataUriBytes, toDataUri } from "./exifImages.js";
import { acceptedJpegs, refusedJpegs } from "./jpegMarkers.js";

const jpeg = dataUriBytes(gradientJpeg);

/** The size Chromium draws `bytes` at: 0x0 when it cannot decode them. */
async function drawnSize(bytes: Uint8Array): Promise<readonly [number, number]> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode().catch(() => undefined);
  return [image.naturalWidth, image.naturalHeight];
}

describe("Chromium and the sniffer agree on JPEG markers", () => {
  // The other refused rows patch a frame type or precision onto baseline Huffman data: no genuine file of that kind,
  // so Chromium's take on them proves nothing; the sniffer refuses those frame types fail-closed. RSTn, TEM, DNL, DAC
  // and short segments Chromium draws: the sniffer refuses them for resvg parity (resvg draws them empty).
  const undrawable = refusedJpegs(jpeg).filter((row) => row.chromiumDrawsNothing);

  test.each(undrawable.map((row) => [row.name, row.bytes] as const))(
    "Chromium draws nothing for a JPEG with %s, which the sniffer refuses",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([0, 0]);
      expect(sniffImage(bytes, 1000).ok).toBe(false);
    },
  );

  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "Chromium draws %s at 32x16, which the sniffer accepts at that size",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([32, 16]);
      expect(sniffImage(bytes, 1000)).toMatchObject({ ok: true, info: { width: 32, height: 16 } });
    },
  );
});
