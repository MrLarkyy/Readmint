import { renderVariant } from "@readmint/cli";
import { describe, expect, test } from "vitest";
import { ActionError } from "../src/index.js";
import { planManifest } from "../src/planManifest.js";

const manifest = (...renders: { name: string; variants?: "dark"[] }[]) => ({
  label: 'manifest "m.json"',
  folder: "ws",
  renders: renders.map((render, index) => ({
    name: render.name,
    design: "ws/repo.json",
    props: { slot: index },
    ...(render.variants === undefined
      ? {}
      : { variants: render.variants.map((name) => renderVariant(name)!) }),
    at: `/renders/${String(index)}`,
  })),
});

const dark = renderVariant("dark");

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

  test("a render without variants takes the run variant, an empty list none", () => {
    const plan = planManifest(
      manifest({ name: "open" }, { name: "none", variants: [] }),
      ".",
      ["svg"],
      dark,
    );
    expect(plan[0]?.dark?.outputs[0]?.output).toBe("open.dark.svg");
    expect(plan[1]).not.toHaveProperty("dark");
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
