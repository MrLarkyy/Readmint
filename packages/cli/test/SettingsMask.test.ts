import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { SettingsMask } from "../src/SettingsMask.js";

const design = {
  version: 0,
  canvas: { width: 10, height: 10 },
  components: {
    box: {
      props: {
        label: { type: "string", default: "" },
        size: { type: "number", default: 1 },
        on: { type: "boolean", default: false },
        tags: { type: "string[]", default: [] },
      },
      layers: [],
    },
  },
  layers: [
    { type: "rect", width: 1, height: 1 },
    { type: "component", ref: "box" },
  ],
} as unknown as Design;

function mask(props: Record<string, string | number | boolean | string[]>) {
  return new SettingsMask("header", props, design);
}

const hidden = /settings section "header" \(prop "(\w+)"\) is not valid here/;

describe("SettingsMask", () => {
  test("hides an issue inside a prop the settings wrote, whatever its message", () => {
    const issue = { path: "/layers/1/props/label", code: "binding", message: "unexpected end" };
    const masked = mask({ label: "{{ 1 + }}" }).mask(issue);
    expect(masked).toMatchObject({ path: issue.path, code: "binding" });
    expect(masked.message).toMatch(hidden);
    expect(masked.message).toContain('prop "label"');
    expect(
      mask({ label: "x" }).mask({ ...issue, path: "/layers/1/props/label/0" }).message,
    ).toMatch(hidden);
  });

  test("hides an issue at any path whose message holds a string value, raw, escaped or clipped", () => {
    const at = { path: "/components/box/layers/0/fill", code: "type" };
    const long = `a "quoted"\nsecret ${"x".repeat(80)}`;
    const settings = mask({ label: long });
    for (const message of [
      `got ${long}`,
      `got ${JSON.stringify(long)}`,
      `got ${JSON.stringify(`${long.slice(0, 64)}...`)}`,
    ]) {
      expect(settings.mask({ ...at, message }).message).toMatch(hidden);
    }
    expect(
      mask({ label: "zero\u200bwidth" }).mask({ ...at, message: 'got "zero\\u200bwidth"' }).message,
    ).toMatch(hidden);
  });

  test("hides an array item and a whole number, not a longer number", () => {
    const at = { path: "/layers/0/width", code: "range" };
    expect(mask({ tags: ["s3cret"] }).mask({ ...at, message: 'got "s3cret"' }).message).toContain(
      'prop "tags"',
    );
    expect(
      mask({ size: -98765 }).mask({ ...at, message: "-98765 is outside 0..10" }).message,
    ).toMatch(hidden);
    const issue = { ...at, message: "1170 is outside 0..10, 2.17 too" };
    expect(mask({ size: 17 }).mask(issue)).toBe(issue);
  });

  test("leaves an unrelated issue as it is: empty strings and booleans trace nothing", () => {
    const issue = {
      path: "/layers/0/fill",
      code: "type",
      message: "expected true or false, got 3",
    };
    expect(mask({ label: "", on: true }).mask(issue)).toBe(issue);
  });

  test("names every prop whose value the message holds", () => {
    const message = mask({ label: "alpha-one", tags: ["beta-two"] }).mask({
      path: "/layers/0/fill",
      code: "type",
      message: "alpha-one and beta-two",
    }).message;
    expect(message).toContain('(props "label", "tags")');
    expect(message).not.toContain("alpha-one");
  });
});
