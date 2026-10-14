import { expect, test } from "vitest";
import * as cli from "../src/index.js";

test("exposes its package name", () => {
  expect(cli.packageName).toBe("@readmint/cli");
});

test("exports the loaders and the renderer call the Action shares with the commands", () => {
  for (const name of ["loadRenderInput", "renderInput", "formatIssue", "quoteForLog"] as const) {
    expect(typeof cli[name], name).toBe("function");
  }
});
