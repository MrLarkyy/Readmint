import { describe, expect, test } from "vitest";
import { AssetPathError } from "../src/index.js";

describe("AssetPathError", () => {
  test("carries its code and source and quotes the source in the message", () => {
    const error = new AssetPathError("outside", 'a"b.png');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AssetPathError");
    expect(error.code).toBe("outside");
    expect(error.src).toBe('a"b.png');
    expect(error.message).toBe('asset "a\\"b.png" resolves outside the design folder');
  });

  test("names the device and the errno code", () => {
    expect(new AssetPathError("device-name", "con.png", "CON").message).toBe(
      'asset "con.png" names the Windows device CON',
    );
    expect(new AssetPathError("unreadable", "img.png", "EACCES").message).toBe(
      'asset "img.png" cannot be read (EACCES)',
    );
  });

  test.each([
    ["\u202e", "\\u202e"],
    ["\u061c", "\\u061c"],
    ["\u200b", "\\u200b"],
    ["\u2066", "\\u2066"],
    ["\u2028", "\\u2028"],
    ["\u0085", "\\u0085"],
    ["\ufeff", "\\ufeff"],
    ["\ue000", "\\ue000"],
    ["\u{f0000}", "\\udb80\\udc00"],
    ["\u0007", "\\u0007"],
    ["\ud800", "\\ud800"],
  ])("escapes %j in the quoted source", (char, escaped) => {
    const { message } = new AssetPathError("not-found", `a${char}b.png`);
    expect(message).toContain(`"a${escaped}b.png"`);
  });

  test("keeps visible non-ASCII characters", () => {
    expect(new AssetPathError("not-found", "na\u00efve/\u{1f600}.png").message).toContain(
      '"na\u00efve/\u{1f600}.png"',
    );
  });

  test("clips the quoted source at 200 code points", () => {
    const src = "\u{1f600}".repeat(300);
    const { message } = new AssetPathError("too-long", src);
    expect(message).toBe(`asset "${"\u{1f600}".repeat(199)}\u2026" is longer than 1024 characters`);
  });

  test("does not clip a source of exactly 200 code points", () => {
    const src = "a".repeat(200);
    expect(new AssetPathError("not-found", src).message).toContain(`"${src}"`);
  });
});
