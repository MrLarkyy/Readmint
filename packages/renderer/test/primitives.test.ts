import { describe, expect, test } from "vitest";
import { decodeBase64, decodedBase64Length, encodeBase64 } from "../src/base64.js";
import { decodeDataUri } from "../src/decodeDataUri.js";
import { formatNumber } from "../src/formatNumber.js";
import { parseColour } from "../src/parseColour.js";

describe("formatNumber", () => {
  test.each([
    [0, "0"],
    [-0, "0"],
    [-0.0001, "0"],
    [1 / 3, "0.333"],
    [2 / 3, "0.667"],
    [12.3456, "12.346"],
    [-5.5, "-5.5"],
    [100_000, "100000"],
    [1e-7, "0"],
    [0.1 + 0.2, "0.3"],
  ])("%s -> %s", (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });
});

describe("base64", () => {
  test("round trips every length and byte value", () => {
    for (let length = 0; length < 260; length++) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 255);
      const text = encodeBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString("base64"));
      expect(decodeBase64(text)).toEqual(bytes);
      expect(decodedBase64Length(text)).toBe(length);
    }
  });

  test.each(["A", "AB=", "A===", "AB=C", "ab-_", "AAAA AAAA", "AAéA"])("refuses %j", (text) => {
    expect(decodeBase64(text)).toBeUndefined();
  });
});

describe("decodeDataUri", () => {
  test("decodes a base64 data URI", () => {
    expect(decodeDataUri("data:image/png;base64,AQID", 10)).toEqual({
      ok: true,
      mime: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  test.each([
    ["https://example.com/a.png", "format"],
    ["data:image/png,abc", "format"],
    ["data:image/png;base64,AQI*", "format"],
    ["data:image/png;base64,AAAAAAAAAAAA", "too-large"],
  ])("%s -> %s", (uri, problem) => {
    expect(decodeDataUri(uri, 8)).toMatchObject({ ok: false, problem });
  });
});

describe("parseColour", () => {
  test.each([
    ["#abc", { hex: "#aabbcc", alpha: 1 }],
    ["#ABCD", { hex: "#aabbcc", alpha: 0xdd / 255 }],
    ["#00ff0080", { hex: "#00ff00", alpha: 128 / 255 }],
    ["#123456", { hex: "#123456", alpha: 1 }],
  ])("%s", (text, colour) => {
    expect(parseColour(text)).toEqual(colour);
  });

  test.each(["red", "#12", "#12345", "#ggg", "abc", "#1234567"])("refuses %s", (text) => {
    expect(parseColour(text)).toBeUndefined();
  });
});
