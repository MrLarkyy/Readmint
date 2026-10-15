import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lineLevels, resolveLevels, visualOrder, type BidiWork } from "../src/index.js";

interface BidiCase {
  readonly line: string;
  readonly text: string;
  /** UTF-16 offset of each code point. */
  readonly units: readonly number[];
  readonly direction: "ltr" | "rtl" | "auto";
  readonly level: number;
  readonly levels: readonly (number | undefined)[];
  readonly order: readonly number[];
}

const directions = ["ltr", "rtl", "auto"] as const;

function cases(): BidiCase[] {
  const file = new URL("./data/BidiCharacterTest-sample.txt", import.meta.url);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [points = "", direction = "0", level = "0", levels = "", order = ""] = line.split(";");
      const codePoints = points.split(" ").map((point) => Number.parseInt(point, 16));
      const units: number[] = [];
      let text = "";
      for (const codePoint of codePoints) {
        units.push(text.length);
        text += String.fromCodePoint(codePoint);
      }
      return {
        line,
        text,
        units,
        direction: directions[Number(direction)] ?? "auto",
        level: Number(level),
        levels: levels.split(" ").map((value) => (value === "x" ? undefined : Number(value))),
        order: order === "" ? [] : order.split(" ").map(Number),
      };
    });
}

describe("BidiCharacterTest (Unicode 16.0.0 sample)", () => {
  const all = cases();

  test("the sample holds the tests it should", () => {
    expect(all.length).toBe(2028);
    expect(all.filter((entry) => entry.direction === "auto").length).toBe(28);
  });

  test("paragraph levels, resolved levels after L1 and the visual order (L2) all match", () => {
    const failures: string[] = [];
    for (const entry of all) {
      const paragraph = resolveLevels(entry.text, entry.direction);
      const levels = lineLevels(paragraph, 0, entry.text.length);
      const actual = entry.units.map((unit, index) =>
        entry.levels[index] === undefined ? undefined : levels[unit],
      );
      const kept = entry.units.flatMap((unit, index) =>
        entry.levels[index] === undefined ? [] : [{ index, level: levels[unit] ?? 0 }],
      );
      const order = visualOrder(kept.map((item) => item.level)).map(
        (position) => kept[position]?.index,
      );
      const same =
        paragraph.level === entry.level &&
        actual.every((level, index) => level === entry.levels[index]) &&
        order.every((index, position) => index === entry.order[position]);
      if (!same) failures.push(entry.line);
    }
    expect(
      failures.slice(0, 5),
      `${String(failures.length)} of ${String(all.length)} fail`,
    ).toEqual([]);
  });
});

describe("bidi bounds", () => {
  test("embeddings deeper than 125 overflow: the text inside stays at level 125 (126 after I2)", () => {
    const text = `${"\u202b".repeat(200)}a`;
    const paragraph = resolveLevels(text, "ltr");
    expect(paragraph.levels[text.length - 1]).toBe(126);
  });

  test("bracket pairs nested deeper than 63 stop pairing; the rest still resolves", () => {
    const text = `\u05d0 ${"(".repeat(70)}a${")".repeat(70)}`;
    const paragraph = resolveLevels(text);
    expect(paragraph.level).toBe(1);
    expect(paragraph.levels[text.indexOf("a")]).toBe(2);
  });

  test("hostile brackets and isolates cost work linear in the text", () => {
    const work = (text: string): number => {
      const counted: BidiWork = { operations: 0 };
      resolveLevels(text, "auto", counted);
      return counted.operations;
    };
    for (const unit of [
      "(",
      "()",
      "(\u05d0)",
      "\u2068",
      "\u2068\u2069",
      "\u2067a",
      "\u202e\u202a",
      "\u05d0 [a",
    ]) {
      const short = work(unit.repeat(2000));
      const long = work(unit.repeat(8000));
      expect(long / short, unit).toBeLessThan(5);
      expect(long, unit).toBeLessThan(8000 * unit.length * 200);
    }
  });

  test("visual order reverses right-to-left runs, numbers keep their order", () => {
    const text = "abc \u05d0\u05d1 12 \u05d2";
    const levels = lineLevels(resolveLevels(text, "ltr"), 0, text.length);
    const order = visualOrder(levels);
    expect(order.map((index) => text[index]).join("")).toBe("abc \u05d2 12 \u05d1\u05d0");
  });
});
