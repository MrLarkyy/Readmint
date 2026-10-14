import { describe, expect, test } from "vitest";
import { escapeForLog } from "../src/index.js";

describe("escapeForLog", () => {
  test.each([
    ["\u0000", "\\u0000"],
    ["\u0007", "\\u0007"],
    ["\t", "\\u0009"],
    ["\n", "\\u000a"],
    ["\r", "\\u000d"],
    ["\u001b", "\\u001b"],
    ["\u007f", "\\u007f"],
    ["\u0085", "\\u0085"],
    ["\u009b", "\\u009b"],
    ["\u061c", "\\u061c"],
    ["\u200b", "\\u200b"],
    ["\u200e", "\\u200e"],
    ["\u2028", "\\u2028"],
    ["\u2029", "\\u2029"],
    ["\u202e", "\\u202e"],
    ["\u2066", "\\u2066"],
    ["\ufeff", "\\ufeff"],
    ["\ue000", "\\ue000"],
    ["\u0378", "\\u0378"],
    ["\u{f0000}", "\\udb80\\udc00"],
    ["\u{e0041}", "\\udb40\\udc41"],
    ["\ud800", "\\ud800"],
    ["\udc00", "\\udc00"],
  ])("escapes %j", (char, escaped) => {
    expect(escapeForLog(`a${char}b`)).toBe(`a${escaped}b`);
  });

  test("keeps visible text, quotes and backslashes as they are", () => {
    const text = 'na\u00efve "q" \\ \u{1f600} \u4e2d <svg> {{x}}';
    expect(escapeForLog(text)).toBe(text);
  });

  test("output is printable ASCII or visible characters only", () => {
    let all = "";
    for (let unit = 0; unit < 0x10000; unit++) all += String.fromCharCode(unit);
    const escaped = escapeForLog(all);
    expect(escaped).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u);
  });
});
