import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseFeedDate } from "../src/parseFeedDate.js";

describe("RFC 3339", () => {
  test.each([
    ["2026-10-16T12:00:00Z", "2026-10-16T12:00:00.000Z"],
    ["2026-10-16t12:00:00z", "2026-10-16T12:00:00.000Z"],
    ["2026-10-16T14:30:00+02:00", "2026-10-16T12:30:00.000Z"],
    ["2026-10-16T14:30:00+0200", "2026-10-16T12:30:00.000Z"],
    ["2026-10-16T00:30:00-01:00", "2026-10-16T01:30:00.000Z"],
    ["2026-10-16T12:00:00.123456789Z", "2026-10-16T12:00:00.123Z"],
    ["2026-10-16T12:00:00.5Z", "2026-10-16T12:00:00.500Z"],
    ["2026-10-16 12:00", "2026-10-16T12:00:00.000Z"],
    ["2026-10-16", "2026-10-16T00:00:00.000Z"],
    ["2024-02-29T00:00:00Z", "2024-02-29T00:00:00.000Z"],
    ["2026-12-31T23:59:60Z", "2027-01-01T00:00:00.000Z"],
    ["  2026-10-16T12:00:00Z  ", "2026-10-16T12:00:00.000Z"],
    ["1969-12-31T23:00:00-02:00", "1970-01-01T01:00:00.000Z"],
  ])("%s is %s", (text, iso) => {
    expect(parseFeedDate(text)).toBe(iso);
  });
});

describe("RFC 822 / 1123", () => {
  test.each([
    ["Fri, 16 Oct 2026 14:30:00 +0200", "2026-10-16T12:30:00.000Z"],
    ["Fri, 16 Oct 2026 14:30:00 GMT", "2026-10-16T14:30:00.000Z"],
    ["16 Oct 2026 14:30 UT", "2026-10-16T14:30:00.000Z"],
    ["Tue, 13 Oct 2026 08:00:00 EST", "2026-10-13T13:00:00.000Z"],
    ["Tue, 13 Oct 2026 08:00:00 PDT", "2026-10-13T15:00:00.000Z"],
    ["Tue, 13 Oct 2026 08:00:00", "2026-10-13T08:00:00.000Z"],
    ["Thu, 08 Oct 26 10:00:00 +0000", "2026-10-08T10:00:00.000Z"],
    ["Thu, 08 Oct 99 10:00:00 +0000", "1999-10-08T10:00:00.000Z"],
    ["Friday, 16 October 2026 14:30:00 -0130", "2026-10-16T16:00:00.000Z"],
    ["Fri,16 oct 2026 14:30:00 Z", "2026-10-16T14:30:00.000Z"],
  ])("%s is %s", (text, iso) => {
    expect(parseFeedDate(text)).toBe(iso);
  });
});

describe("unreadable dates are null", () => {
  test.each([
    [""],
    ["yesterday"],
    ["2026-13-01T00:00:00Z"],
    ["2026-02-29T00:00:00Z"],
    ["2026-04-31"],
    ["2026-10-16T24:00:00Z"],
    ["2026-10-16T12:60:00Z"],
    ["2026-10-16T12:00:00+24:00"],
    ["Fri, 16 Foo 2026 14:30:00 GMT"],
    ["Fri, 16 Oct 2026 14:30:00 XYZ"],
    ["Fri, 16 Oct 2026 14:30:00 constructor"],
    ["1969-12-31T23:59:59Z"],
    ["9999-12-31T23:00:00-02:00"],
    ["0001-01-01T00:00:00Z"],
    ["1700000000000"],
    [`2026-10-16T12:00:00Z${" ".repeat(100)}x`],
  ])("%j", (text) => {
    expect(parseFeedDate(text)).toBeNull();
  });
});

test("the source never calls Date.parse, nor new Date with anything but the computed epoch", () => {
  const dir = join(import.meta.dirname, "..", "src");
  for (const file of readdirSync(dir)) {
    const source = readFileSync(join(dir, file), "utf8");
    expect(source, file).not.toMatch(/Date\.parse\(|new Date\((?!epoch\))/);
  }
});
