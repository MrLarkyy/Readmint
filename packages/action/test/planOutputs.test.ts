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

describe("planOutputs", () => {
  test("names outputs after the design stem, in the listed order", async () => {
    expect(await planOutputs(["b/stats.yaml", "./card.json"], "out", existing())).toEqual([
      { stem: "stats", light: { design: "b/stats.yaml", output: "out/stats.svg" } },
      { stem: "card", light: { design: "card.json", output: "out/card.svg" } },
    ]);
  });

  test("pairs a dark twin found next to the design", async () => {
    expect(await planOutputs(["d/card.json"], "out", existing("d/card.dark.json"))).toEqual([
      {
        stem: "card",
        light: { design: "d/card.json", output: "out/card.svg" },
        dark: { design: "d/card.dark.json", output: "out/card.dark.svg" },
      },
    ]);
  });

  test("an output folder of . writes next to the workspace root", async () => {
    expect(await planOutputs(["card.json"], ".", existing())).toEqual([
      { stem: "card", light: { design: "card.json", output: "card.svg" } },
    ]);
  });

  test("a twin listed with its light design is used once", async () => {
    const plan = await planOutputs(["card.dark.json", "card.json"], "out", existing());
    expect(plan).toEqual([
      {
        stem: "card",
        light: { design: "card.json", output: "out/card.svg" },
        dark: { design: "card.dark.json", output: "out/card.dark.svg" },
      },
    ]);
  });

  test("a twin listed without its light design is refused", async () => {
    expect(await inputError(planOutputs(["card.dark.json"], "out", existing()))).toEqual([
      'design "card.dark.json" is a dark variant, but its design "card.json" is not listed',
    ]);
  });

  test("two designs with one output name are refused, also when the case differs", async () => {
    expect(
      await inputError(planOutputs(["a/card.json", "b/Card.yaml"], "out", existing())),
    ).toEqual(['designs "a/card.json" and "b/Card.yaml" both write "out/Card.svg"']);
  });

  test("a design listed twice is refused", async () => {
    expect(await inputError(planOutputs(["card.json", "./card.json"], "out", existing()))).toEqual([
      'design "card.json" is listed twice',
    ]);
  });
});
