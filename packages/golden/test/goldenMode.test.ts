import { describe, expect, test } from "vitest";
import { goldenMode } from "../src/node/goldenMode.js";
import { goldenEnvironment } from "../src/vitest/goldenEnvironment.js";

describe("goldenMode", () => {
  test("only the exact value 1 selects update", () => {
    expect(goldenMode({ READMINT_GOLDEN_UPDATE: "1" })).toBe("update");
    for (const value of [undefined, "", "0", "true", "yes", "11"]) {
      expect(goldenMode({ READMINT_GOLDEN_UPDATE: value })).toBe("check");
    }
  });
});

describe("goldenEnvironment", () => {
  test("a normal run forces check mode whatever the shell exports", () => {
    expect(goldenEnvironment("test", { READMINT_GOLDEN_UPDATE: "1" })).toEqual({
      READMINT_GOLDEN_UPDATE: "0",
    });
  });

  test("the update mode turns writing on", () => {
    expect(goldenEnvironment("golden-update", {})).toEqual({ READMINT_GOLDEN_UPDATE: "1" });
  });

  test("the update mode is refused when CI is set", () => {
    expect(() => goldenEnvironment("golden-update", { CI: "true" })).toThrow(/CI/);
    expect(() => goldenEnvironment("golden-update", { CI: "" })).not.toThrow();
  });
});
