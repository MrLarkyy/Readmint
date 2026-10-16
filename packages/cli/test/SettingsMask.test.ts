import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyDesignProps, type Design, parseDesignProps } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { loadDesignFile } from "../src/index.js";
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
      layers: [{ type: "group", layers: [{ type: "component", ref: "inner" }] }],
    },
    inner: { layers: [] },
    other: { layers: [] },
  },
  layers: [
    { type: "rect", width: 1, height: 1 },
    { type: "component", ref: "box" },
  ],
} as unknown as Design;

function mask(props: Record<string, string | number | boolean | string[]>) {
  return new SettingsMask("header", props, design);
}

const hidden = /settings section "header" \((prop|props) "(\w+)".*\) is not valid here/;
const child = { path: "/components/box/layers/0/fill", code: "type" };

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

  test("hides a child layer issue whose message quotes a string value, escaped or clipped", () => {
    const long = `a "quoted"\nsecret ${"x".repeat(80)}`;
    const settings = mask({ label: long });
    for (const message of [
      `got ${JSON.stringify(long)}`,
      `got ${JSON.stringify(`${long.slice(0, 64)}...`)}`,
    ]) {
      expect(settings.mask({ ...child, message }).message).toMatch(hidden);
    }
    expect(
      mask({ label: "zero\u200bwidth" }).mask({ ...child, message: 'got "zero\\u200bwidth"' })
        .message,
    ).toMatch(hidden);
    for (const short of ["x", "ab"]) {
      expect(
        mask({ label: short }).mask({ ...child, message: `got ${JSON.stringify(short)}` }).message,
      ).toMatch(hidden);
    }
  });

  test("looks into nested components of the written instance only", () => {
    const message = 'expected a colour, got "s3cret"';
    const settings = mask({ label: "s3cret" });
    expect(
      settings.mask({ path: "/components/inner/layers/0/fill", code: "type", message }).message,
    ).toMatch(hidden);
    for (const path of ["/components/other/layers/0/fill", "/layers/0/fill", "/assets/fonts/a"]) {
      const issue = { path, code: "type", message };
      expect(settings.mask(issue)).toBe(issue);
    }
  });

  test("matches a string only in its quoted form", () => {
    const issue = { ...child, message: "2 remaining, domain main" };
    expect(mask({ label: "main" }).mask(issue)).toBe(issue);
  });

  test("hides an array item and a whole number, not a longer number", () => {
    expect(
      mask({ tags: ["s3cret"] }).mask({ ...child, message: 'got "s3cret"' }).message,
    ).toContain('prop "tags"');
    expect(
      mask({ size: -98765 }).mask({ ...child, message: "-98765 is outside 0..10" }).message,
    ).toMatch(hidden);
    const issue = { ...child, message: "1170 is outside 0..10, 2.17 too" };
    expect(mask({ size: 17 }).mask(issue)).toBe(issue);
  });

  test("leaves an unrelated issue as it is: empty strings and booleans trace nothing", () => {
    const issue = { ...child, message: 'expected true or false, got ""' };
    expect(mask({ label: "", on: true }).mask(issue)).toBe(issue);
  });

  test("names every prop whose value the message holds", () => {
    const message = mask({ label: "alpha-one", tags: ["beta-two"] }).mask({
      ...child,
      message: 'got "alpha-one" and "beta-two"',
    }).message;
    expect(message).toContain('(props "label", "tags")');
    expect(message).not.toContain("alpha-one");
  });
});

describe("with the shipped settings files", () => {
  const profiles = join(import.meta.dirname, "..", "..", "components", "templates", "profiles");

  async function shipped(template: string, section: string): Promise<SettingsMask> {
    const folder = join(profiles, template);
    const settings = parseDesignProps(readFileSync(join(folder, "settings.json"), "utf8"));
    if (!settings.ok) throw new Error(`${template} settings.json is invalid`);
    const props = settings.value[section] ?? {};
    const file = await loadDesignFile(`${section}.json`, { cwd: folder });
    const applied = applyDesignProps(file.design, props);
    if (!applied.ok) throw new Error(`${template} ${section} takes no settings`);
    return new SettingsMask(section, props, applied.value);
  }

  test("year-ring index (languagesAfter 2): a font warning naming 2 more characters stays", async () => {
    const settings = await shipped("year-ring", "index");
    const issue = {
      path: "/assets/fonts/reg",
      code: "missing-glyph",
      message:
        'font asset "reg" and its fallbacks have no glyph for U+1F600 and 2 more (first at /layers/2/layers/0); these characters are not drawn and take no space',
    };
    expect(settings.mask(issue)).toBe(issue);
    const outside = { path: "/layers/2/width", code: "range", message: "2 is outside 3..10" };
    expect(settings.mask(outside)).toBe(outside);
  });

  test('pinscreen header (branch "main"): data messages holding "remaining" stay', async () => {
    const settings = await shipped("pinscreen", "header");
    const file = await loadDesignFile("header.json", { cwd: join(profiles, "pinscreen") });
    const root = file.design.layers.find((layer) => layer.type === "component");
    if (root?.type !== "component") throw new Error("pinscreen header has no root component");
    for (const path of [`/components/${root.ref}/layers/0/text`, "/layers/0"]) {
      const issue = { path, code: "type", message: 'expected a number, got "remaining" (domain)' };
      expect(settings.mask(issue)).toBe(issue);
    }
  });
});
