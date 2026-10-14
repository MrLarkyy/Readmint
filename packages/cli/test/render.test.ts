import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDesign } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
  await tree.file("data.json", { v: 12 });
});

afterEach(async () => {
  await tree.remove();
});

/** What the renderer gives for a design file, with its assets and data read straight from disk. */
async function expected(design: string, data?: string, time?: number): Promise<string> {
  const parsed = parseDesign(await readFile(join(tree.root, design), "utf8"));
  if (!parsed.ok) throw new Error("test design is invalid");
  const result = renderSvg(parsed.value, {
    assets: { fonts: {}, images: { logo: await readFile(join(tree.root, "bound", "logo.png")) } },
    ...(data === undefined
      ? {}
      : {
          data: JSON.parse(await readFile(join(tree.root, data), "utf8")) as Record<
            string,
            unknown
          >,
        }),
    ...(time === undefined ? {} : { time }),
  });
  if (!result.ok) throw new Error("test design does not render");
  return result.svg;
}

describe("render", () => {
  test("writes exactly the bytes renderSvg returns to standard output", async () => {
    const run = await tree.run(["render", "bound/design.json", "--data", "data.json"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(run.stdout).toBe(await expected("bound/design.json", "data.json"));
    expect(run.stdout.endsWith("</svg>")).toBe(true);
  });

  test("writes the same bytes to --out and nothing to standard output", async () => {
    await tree.file("out/.keep", "");
    const run = await tree.run([
      "render",
      "bound/design.json",
      "--data",
      "data.json",
      "--out",
      "out/a.svg",
    ]);
    expect(run).toMatchObject({ code: ExitCode.ok, stdout: "", stderr: "" });
    expect(await readFile(join(tree.root, "out", "a.svg"), "utf8")).toBe(
      await expected("bound/design.json", "data.json"),
    );
  });

  test("prints warnings to standard error and still exits 0", async () => {
    await tree.file("anim.json", {
      version: 0,
      canvas: { width: 10, height: 10 },
      animation: { duration: 1000, loop: false },
      layers: [
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{[0, 1, 2, 3, 4]}}" },
          animate: {
            opacity: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 1 },
              ],
              stagger: 300,
              duration: 400,
            },
          },
        },
      ],
    });
    const run = await tree.run(["render", "anim.json"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toMatch(/^<svg /);
    expect(run.stderr).toBe(
      "anim.json: warning animation-cut at /layers/0/animate/opacity: the track runs past the end of the 1000 ms timeline and is cut there\n",
    );
  });

  test("--time renders that frame", async () => {
    await tree.file("anim.json", {
      version: 0,
      canvas: { width: 10, height: 10 },
      animation: { duration: 1000 },
      layers: [
        {
          type: "rect",
          width: 4,
          height: 4,
          animate: {
            x: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 6 },
              ],
            },
          },
        },
      ],
    });
    const frame = await tree.run(["render", "anim.json", "--time", "500"]);
    const animated = await tree.run(["render", "anim.json"]);
    expect(frame.code).toBe(ExitCode.ok);
    expect(frame.stdout).not.toBe(animated.stdout);
    expect(frame.stdout).toBe(await expected("anim.json", undefined, 500));
  });

  test.runIf(process.platform === "win32")("takes a backslash-separated design path", async () => {
    const run = await tree.run(["render", "bound\\design.json", "--data", "data.json"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toBe(await expected("bound/design.json", "data.json"));
  });

  test("names the design by its path relative to --root", async () => {
    const run = await tree.run(["render", "bound/design.json", "--root", "bound"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toMatch(/^design\.json: error binding at \/layers\/0\/height: /);
  });
});

describe("printed lines are escaped (RM-25)", () => {
  const hostile = "\u202e21\u0085\u2066\u2028\u200b";

  test("a fixture string the renderer quotes in an issue", async () => {
    await tree.file("hostile.json", { v: hostile });
    const run = await tree.run(["render", "bound/design.json", "--data", "hostile.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toBe(
      'bound/design.json: error type at /layers/0/height: expected a number, got "\\u202e21\\u0085\\u2066\\u2028\\u200b"\n',
    );
    expect(run.stderr).not.toMatch(/[\u202e\u0085\u2066\u2028\u200b]/u);
  });

  test("a design value format quotes without escaping a zero-width space", async () => {
    await tree.file("odd.json", {
      version: 0,
      canvas: { width: 10, height: 10 },
      layers: [],
      "a\u200bb": 1,
    });
    const run = await tree.run(["validate", "odd.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('"a\\u200bb"');
    expect(run.stderr).not.toContain("\u200b");
  });

  test("a design file name with control characters", async () => {
    const run = await tree.run(["render", "a\u001b[31m.json"]);
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).not.toContain("\u001b");
  });
});
