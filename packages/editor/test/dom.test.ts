import { expect, test } from "vitest";
import { readCapped } from "../src/dom.js";

/** A file that records whether anything read its contents. */
class WatchedBlob extends Blob {
  read = false;

  override arrayBuffer(): Promise<ArrayBuffer> {
    this.read = true;
    return super.arrayBuffer();
  }
}

test("readCapped checks the size before it reads a byte", async () => {
  const big = new WatchedBlob([new Uint8Array(11)]);
  expect(await readCapped(big, 10)).toBeUndefined();
  expect(big.read).toBe(false);
  const small = new WatchedBlob([new Uint8Array([1, 2, 3])]);
  expect(await readCapped(small, 10)).toEqual(new Uint8Array([1, 2, 3]));
  expect(small.read).toBe(true);
});
