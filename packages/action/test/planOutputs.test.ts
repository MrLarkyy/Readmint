import { renderVariant } from "@readmint/cli";
import { describe, expect, test } from "vitest";
import { ActionError } from "../src/index.js";
import { planOutputs } from "../src/planOutputs.js";

const existing =
  (...files: string[]) =>
  (design: string): Promise<boolean> =>
    Promise.resolve(files.includes(design));

async function inputError(promise: Promise<unknown>): Promise<readonly string[]> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error instanceof ActionError && error.kind === "input") return error.lines;
  throw new Error("expected an input error");
}

const svg = ["svg"] as const;

describe("planOutputs", () => {
  test("names outputs after the design stem, in the listed order", async () => {
    expect(await planOutputs(["b/stats.yaml", "./card.json"], "out", svg, existing())).toEqual([
      {
        stem: "stats",
        light: { design: "b/stats.yaml", outputs: [{ format: "svg", output: "out/stats.svg" }] },
      },
      {
        stem: "card",
        light: { design: "card.json", outputs: [{ format: "svg", output: "out/card.svg" }] },
      },
    ]);
  });

  test("pairs a dark twin found next to the design", async () => {
    expect(await planOutputs(["d/card.json"], "out", svg, existing("d/card.dark.json"))).toEqual([
      {
        stem: "card",
        light: { design: "d/card.json", outputs: [{ format: "svg", output: "out/card.svg" }] },
        dark: {
          design: "d/card.dark.json",
          outputs: [{ format: "svg", output: "out/card.dark.svg" }],
        },
      },
    ]);
  });

  test("an output folder of . writes next to the workspace root", async () => {
    expect(await planOutputs(["card.json"], ".", svg, existing())).toEqual([
      {
        stem: "card",
        light: { design: "card.json", outputs: [{ format: "svg", output: "card.svg" }] },
      },
    ]);
  });

  test("a twin listed with its light design is used once", async () => {
    const plan = await planOutputs(["card.dark.json", "card.json"], "out", svg, existing());
    expect(plan).toEqual([
      {
        stem: "card",
        light: { design: "card.json", outputs: [{ format: "svg", output: "out/card.svg" }] },
        dark: {
          design: "card.dark.json",
          outputs: [{ format: "svg", output: "out/card.dark.svg" }],
        },
      },
    ]);
  });

  test("a twin listed without its light design is refused", async () => {
    expect(await inputError(planOutputs(["card.dark.json"], "out", svg, existing()))).toEqual([
      'design "card.dark.json" is a dark variant, but its design "card.json" is not listed',
    ]);
  });

  test("two designs with one output name are refused, also when the case differs", async () => {
    expect(
      await inputError(planOutputs(["a/card.json", "b/Card.yaml"], "out", svg, existing())),
    ).toEqual(['designs "a/card.json" and "b/Card.yaml" both write "out/Card.svg"']);
  });

  test("a design listed twice is refused", async () => {
    expect(
      await inputError(planOutputs(["card.json", "./card.json"], "out", svg, existing())),
    ).toEqual(['design "card.json" is listed twice']);
  });

  test("one output per format, in the listed order; apng writes .png", async () => {
    expect(
      await planOutputs(
        ["d/card.json"],
        "out",
        ["webp", "svg", "apng"],
        existing("d/card.dark.json"),
      ),
    ).toEqual([
      {
        stem: "card",
        light: {
          design: "d/card.json",
          outputs: [
            { format: "webp", output: "out/card.webp" },
            { format: "svg", output: "out/card.svg" },
            { format: "apng", output: "out/card.png" },
          ],
        },
        dark: {
          design: "d/card.dark.json",
          outputs: [
            { format: "webp", output: "out/card.dark.webp" },
            { format: "svg", output: "out/card.dark.svg" },
            { format: "apng", output: "out/card.dark.png" },
          ],
        },
      },
    ]);
  });

  test("a raster output another design also writes is refused", async () => {
    expect(
      await inputError(planOutputs(["a/card.json", "b/card.yaml"], "out", ["gif"], existing())),
    ).toEqual(['designs "a/card.json" and "b/card.yaml" both write "out/card.gif"']);
  });
});

describe("planOutputs with a variant", () => {
  const dark = renderVariant("dark");
  if (dark === undefined) throw new Error("no dark variant");

  test("a design without a twin gets the variant rendered from its own file", async () => {
    expect(await planOutputs(["d/card.json"], "out", ["svg", "png"], existing(), dark)).toEqual([
      {
        stem: "card",
        light: {
          design: "d/card.json",
          outputs: [
            { format: "svg", output: "out/card.svg" },
            { format: "png", output: "out/card.png" },
          ],
        },
        dark: {
          design: "d/card.json",
          variant: dark,
          outputs: [
            { format: "svg", output: "out/card.dark.svg" },
            { format: "png", output: "out/card.dark.png" },
          ],
        },
      },
    ]);
  });

  test("a twin found or listed wins and carries no variant", async () => {
    for (const designs of [["card.json"], ["card.json", "card.dark.json"]]) {
      const [entry] = await planOutputs(designs, "out", svg, existing("card.dark.json"), dark);
      expect(entry?.dark).toEqual({
        design: "card.dark.json",
        outputs: [{ format: "svg", output: "out/card.dark.svg" }],
      });
    }
  });

  test("without a variant the plan is the one without a twin", async () => {
    const [entry] = await planOutputs(["card.json"], "out", svg, existing());
    expect(entry).not.toHaveProperty("dark");
  });
});
