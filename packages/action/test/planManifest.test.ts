import { renderVariant } from "@readmint/cli";
import { describe, expect, test } from "vitest";
import { ActionError } from "../src/index.js";
import { planManifest } from "../src/planManifest.js";

const dark = renderVariant("dark");
if (dark === undefined) throw new Error("no dark variant");

const manifest = (...renders: { name: string; variants?: "dark"[] }[]) => ({
  label: 'manifest "m.json"',
  folder: "ws",
  renders: renders.map((render, index) => ({
    name: render.name,
    design: "ws/repo.json",
    props: { slot: index },
    variants: (render.variants ?? []).map(() => dark),
    at: `/renders/${String(index)}`,
  })),
});

describe("planManifest", () => {
  test("names outputs after the renders, in order, with the entry and the root", () => {
    const [first, second] = planManifest(
      manifest({ name: "a", variants: ["dark"] }, { name: "b" }),
      "out",
      ["svg", "png"],
    );
    expect(first).toMatchObject({
      stem: "a",
      light: {
        design: "ws/repo.json",
        root: "ws",
        entry: { name: "a", props: { slot: 0 }, at: "/renders/0", manifest: 'manifest "m.json"' },
        outputs: [
          { format: "svg", output: "out/a.svg" },
          { format: "png", output: "out/a.png" },
        ],
      },
      dark: {
        variant: dark,
        outputs: [
          { format: "svg", output: "out/a.dark.svg" },
          { format: "png", output: "out/a.dark.png" },
        ],
      },
    });
    expect(second).toMatchObject({ stem: "b" });
    expect(second).not.toHaveProperty("dark");
  });

  test("a render with no resolved variant has no dark output", () => {
    const plan = planManifest(manifest({ name: "none" }), ".", ["svg"]);
    expect(plan[0]).not.toHaveProperty("dark");
  });

  test("no twin file is involved: the dark render is the design with the variant", () => {
    const [plan] = planManifest(manifest({ name: "a", variants: ["dark"] }), "out", ["svg"]);
    expect(plan?.dark?.design).toBe("ws/repo.json");
  });

  test("two renders writing one file, letter case ignored, are an input error", () => {
    const error = (() => {
      try {
        planManifest(manifest({ name: "Card" }, { name: "card" }), "out", ["svg"]);
      } catch (reason) {
        return reason;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ActionError);
    expect((error as ActionError).lines).toEqual([
      'renders "Card" and "card" both write "out/card.svg"',
    ]);
  });
});
