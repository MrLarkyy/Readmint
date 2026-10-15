import { crc32 as zlibCrc32 } from "node:zlib";
import { expect, test } from "vitest";
import { crc32 } from "../src/index.js";

test("crc32 is the PNG CRC", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("crc32 agrees with zlib on every byte value", () => {
  const bytes = Uint8Array.from({ length: 1024 }, (_, index) => (index * 31 + 7) & 0xff);
  expect(crc32(bytes)).toBe(zlibCrc32(bytes));
  expect(crc32(new Uint8Array(0))).toBe(0);
});
