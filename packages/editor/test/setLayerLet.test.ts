import { DesignLimits, LocalNames } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { getAt } from "../src/designPointer.js";
import { setLayerLet, type LetEntries } from "../src/index.js";
import { editState, rectPointer } from "./formatEdits.js";

const state = editState();
const layerOf = (s: typeof state) => getAt(s.design, rectPointer) as Record<string, unknown>;

function ok(entries: LetEntries) {
  const next = setLayerLet(state, rectPointer, entries);
  expect(next.issues).toEqual([]);
  return next;
}

function refused(entries: LetEntries) {
  const next = setLayerLet(state, rectPointer, entries);
  expect(next.design).toBe(state.design);
  expect(next.issues).toHaveLength(1);
  return next.issues[0]?.message ?? "";
}

describe("setLayerLet", () => {
  test("add, rename, edit and move touch only the let", () => {
    const before = layerOf(state);
    const lists: LetEntries[] = [
      [
        ["a", "{{ 1 }}"],
        ["b", "{{ a + 1 }}"],
        ["c", "{{ b }}"],
      ],
      [
        ["x", "{{ 1 }}"],
        ["b", "{{ x + 1 }}"],
      ],
      [
        ["a", "{{ 7 }}"],
        ["b", "{{ a + 1 }}"],
      ],
      [
        ["a", "{{ 1 }}"],
        ["b", "{{ 2 }}"],
      ],
    ];
    for (const entries of lists) {
      const after = layerOf(ok(entries));
      expect(Object.entries(after["let"] as object)).toEqual(entries);
      for (const key of Object.keys(before).filter((one) => one !== "let")) {
        expect(after[key]).toBe(before[key]);
      }
    }
  });

  test("an empty list removes the let", () => {
    expect(Object.hasOwn(layerOf(ok([])), "let")).toBe(false);
  });

  test("the layer keeps its animate (cycles included) and orbit by identity", () => {
    const after = layerOf(ok([["z", "{{ 3 }}"]]));
    const before = layerOf(state);
    expect(after["animate"]).toBe(before["animate"]);
    expect(after["orbit"]).toBe(before["orbit"]);
  });

  test("a change that changes nothing is no change", () => {
    const same = setLayerLet(state, rectPointer, [
      ["a", "{{ 1 }}"],
      ["b", "{{ a + 1 }}"],
    ]);
    expect(same.design).toBe(state.design);
    expect(same.issues).toEqual([]);
  });

  test.each([
    ["a reserved name", [["props", "{{ 1 }}"]]],
    ["a bad name", [["1x", "{{ 1 }}"]]],
    ["an expression that is no binding", [["a", "plain"]]],
  ] as const)("%s is refused by the format with the state unchanged", (_name, entries) => {
    refused(entries);
  });

  test("a name of 65 characters and an expression past maxBindingLength are refused", () => {
    expect(refused([["n".repeat(LocalNames.maxLength + 1), "{{ 1 }}"]])).toContain("longer than");
    const long = `{{${" ".repeat(DesignLimits.maxBindingLength)}1}}`;
    const message = refused([["a", long]]);
    expect(message).toContain(String(DesignLimits.maxBindingLength));
    expect(message.length).toBeLessThan(300);
  });

  test("an expression of exactly maxBindingLength is taken", () => {
    const edge = `{{${" ".repeat(DesignLimits.maxBindingLength - 5)}1}}`;
    expect(edge).toHaveLength(DesignLimits.maxBindingLength);
    expect(ok([["a", edge]]).design).not.toBe(state.design);
  });

  test("a duplicate name is refused", () => {
    expect(
      refused([
        ["a", "{{ 1 }}"],
        ["a", "{{ 2 }}"],
      ]),
    ).toContain("twice");
  });

  test("non-string items and a non-layer pointer are refused", () => {
    refused([["a", 1]] as unknown as LetEntries);
    refused(["a"] as unknown as LetEntries);
    const canvas = setLayerLet(state, "/canvas", []);
    expect(canvas.design).toBe(state.design);
    expect(canvas.issues).toHaveLength(1);
  });

  test("past maxLetEntries is refused before any entry is read", () => {
    refused(
      Array.from({ length: DesignLimits.maxLetEntries + 1 }, (_, i) => [
        `n${String(i)}`,
        "{{ 1 }}",
      ]),
    );
    const huge = new Array<readonly [string, string]>(1_000_000).fill(["a", "{{ 1 }}"]);
    const start = performance.now();
    refused(huge);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("maxLetEntries entries are taken", () => {
    const entries = Array.from(
      { length: DesignLimits.maxLetEntries },
      (_, i) => [`n${String(i)}`, "{{ 1 }}"] as const,
    );
    expect(Object.keys(layerOf(ok(entries))["let"] as object)).toHaveLength(64);
  });

  test.each(["__proto__", "constructor", "prototype"])(
    "%s is an own key and the prototype stays clean",
    (name) => {
      const after = layerOf(ok([[name, "{{ 1 }}"]]));
      const bindings = after["let"] as object;
      expect(Object.hasOwn(bindings, name)).toBe(true);
      expect(Object.getPrototypeOf(bindings)).toBe(Object.prototype);
      expect(Object.keys(Object.prototype)).toEqual([]);
    },
  );
});
