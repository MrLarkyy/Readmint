import { describe, expect, test } from "vitest";
import { migrateDesign, type DesignMigration } from "../src/index.js";

const renameTitle: DesignMigration = {
  from: 0,
  to: 1,
  migrate(document) {
    document["name"] = document["title"];
    delete document["title"];
    (document["canvas"] as Record<string, unknown>)["unit"] = "px";
    return document;
  },
};

const addTheme: DesignMigration = {
  from: 1,
  to: 2,
  migrate: (document) => ({ ...document, theme: "dark" }),
};

const v0 = () => ({ version: 0, title: "Old", canvas: { width: 10, height: 10 }, layers: [] });

describe("migrateDesign", () => {
  test("runs the chain to the target on a copy and reports the source version", () => {
    const input = v0();
    const before = structuredClone(input);
    const result = migrateDesign(input, { migrations: [addTheme, renameTitle], target: 2 });
    expect(result).toEqual({
      ok: true,
      migratedFrom: 0,
      value: {
        version: 2,
        name: "Old",
        canvas: { width: 10, height: 10, unit: "px" },
        layers: [],
        theme: "dark",
      },
    });
    expect(input).toEqual(before);
  });

  test("a missing step fails with migration-missing", () => {
    const result = migrateDesign(v0(), { migrations: [renameTitle], target: 2 });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/version", code: "migration-missing" }],
    });
  });

  test("a step that skips a version does not count as the chain", () => {
    const skip: DesignMigration = { from: 0, to: 2, migrate: (document) => document };
    const result = migrateDesign(v0(), { migrations: [skip], target: 2 });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "migration-missing" }] });
  });

  test("a newer or negative version is unsupported", () => {
    expect(migrateDesign({ ...v0(), version: 3 })).toMatchObject({
      ok: false,
      issues: [
        {
          path: "/version",
          code: "unsupported-version",
          message: "version 3 is newer than supported 0",
        },
      ],
    });
    expect(migrateDesign({ ...v0(), version: -1 })).toMatchObject({
      issues: [{ path: "/version", code: "unsupported-version" }],
    });
  });

  test("a missing or non-integer version fails at /version", () => {
    const unversioned: Record<string, unknown> = v0();
    delete unversioned["version"];
    expect(migrateDesign(unversioned)).toMatchObject({
      issues: [{ path: "/version", code: "missing-property" }],
    });
    for (const version of ["0", 0.5, null, Number.NaN])
      expect(migrateDesign({ ...v0(), version })).toMatchObject({
        issues: [{ path: "/version", code: "type" }],
      });
  });

  test("the default registry passes a current document through untouched", () => {
    const input = v0();
    const result = migrateDesign(input);
    expect(result.ok && result.value).toBe(input);
    expect(result.ok && result.migratedFrom).toBeUndefined();
  });

  test("an own __proto__ key survives the copy as data", () => {
    const input = JSON.parse(
      '{"version":0,"canvas":{"width":1,"height":1},"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    const result = migrateDesign(input, { migrations: [renameTitle], target: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value)).toContain("__proto__");
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  test("a cyclic object fails without overflowing the stack", () => {
    const layers: unknown[] = [];
    layers.push(layers);
    const result = migrateDesign({ ...v0(), layers }, { migrations: [renameTitle], target: 1 });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "too-deep" }] });
  });
});
