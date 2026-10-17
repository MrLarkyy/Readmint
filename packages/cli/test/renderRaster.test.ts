import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { parseCliArgs } from "../src/parseCliArgs.js";
import { boundDesign, type CliTree, makeCliTree, plainDesign, png } from "./cliTree.js";

let tree: CliTree;

const animatedDesign = {
  ...plainDesign,
  animation: { duration: 400 },
  layers: [
    {
      type: "rect",
      width: 10,
      height: 10,
      fill: "#1a7f37",
      animate: {
        x: {
          keyframes: [
            { offset: 0, value: 0 },
            { offset: 1, value: 10 },
          ],
        },
      },
    },
  ],
};

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
  await tree.file("data.json", { v: 12 });
  await tree.file("plain.json", plainDesign);
  await tree.file("animated.json", animatedDesign);
  await tree.file("out/.keep", "");
});

afterEach(async () => {
  await tree.remove();
});

function size(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  return [view.getUint32(16), view.getUint32(20)];
}

describe("render options", () => {
  test("the format comes from --format, else the --out extension, else svg", () => {
    const format = (args: string[]) => {
      const command = parseCliArgs(["render", "d.json", ...args]);
      return command.name === "render" ? command.format : undefined;
    };
    expect(format([])).toBe("svg");
    expect(format(["--out", "a.svg"])).toBe("svg");
    expect(format(["--out", "a.png"])).toBe("png");
    expect(format(["--out", "dir.x/A.WEBP"])).toBe("webp");
    expect(format(["--out", "a.gif"])).toBe("gif");
    expect(format(["--out", "a.apng"])).toBe("apng");
    expect(format(["--out", "a.txt"])).toBe("svg");
    expect(format(["--out", "a.png", "--format", "apng"])).toBe("apng");
    expect(format(["--out", "a.png", "--format", "svg"])).toBe("svg");
  });

  test("scale and frame rate are parsed", () => {
    expect(
      parseCliArgs(["render", "d.json", "--out", "a.gif", "--scale", "1.5", "--frame-rate", "50"]),
    ).toMatchObject({ format: "gif", scale: 1.5, frameRate: 50 });
  });

  test("quality is parsed for webp", () => {
    expect(parseCliArgs(["render", "d.json", "--out", "a.webp", "--quality", "80"])).toMatchObject({
      format: "webp",
      quality: 80,
    });
    for (const quality of ["1", "100"]) {
      expect(
        parseCliArgs([
          "render",
          "d.json",
          "--format",
          "webp",
          "--out",
          "a.x",
          "--quality",
          quality,
        ]),
      ).toMatchObject({ quality: Number(quality) });
    }
    expect(parseCliArgs(["render", "d.json", "--out", "a.webp"])).not.toHaveProperty("quality");
  });

  test.each([
    [["--format", "png"], "--format png needs --out"],
    [["--format", "jpeg", "--out", "a.jpg"], "--format must be one of svg, png, webp, apng, gif"],
    [["--out", "a.png", "--scale", "5"], "--scale must be a number in 1..4"],
    [["--out", "a.png", "--scale", "0.5"], "--scale must be a number in 1..4"],
    [["--out", "a.png", "--scale", "2x"], "--scale must be a number in 1..4"],
    [["--out", "a.webp", "--frame-rate", "0"], "--frame-rate must be a whole number in 1..60"],
    [["--out", "a.webp", "--frame-rate", "61"], "--frame-rate must be a whole number in 1..60"],
    [["--out", "a.webp", "--frame-rate", "2.5"], "--frame-rate must be a whole number in 1..60"],
    [
      ["--out", "a.gif", "--frame-rate", "51"],
      "--frame-rate must be a whole number in 1..50 for gif",
    ],
    [["--out", "a.webp", "--quality", "0"], "--quality must be a whole number in 1..100"],
    [["--out", "a.webp", "--quality", "101"], "--quality must be a whole number in 1..100"],
    [["--out", "a.webp", "--quality", "abc"], "--quality must be a whole number in 1..100"],
    [["--out", "a.webp", "--quality", "8.5"], "--quality must be a whole number in 1..100"],
    [["--out", "a.png", "--quality", "80"], "option --quality applies to webp output only"],
    [["--out", "a.gif", "--quality", "80"], "option --quality applies to webp output only"],
    [["--quality", "80"], "option --quality applies to webp output only"],
    [["--scale", "2"], "option --scale applies to png, webp, apng and gif output only"],
    [["--out", "a.svg", "--frame-rate", "10"], "option --frame-rate applies to png, webp"],
  ])("%j is a usage error naming the range", async (args, message) => {
    const run = await tree.run(["render", "plain.json", ...args]);
    expect(run.code).toBe(ExitCode.usage);
    expect(run.stderr).toContain(message);
    expect(run.stdout).toBe("");
  });

  test("raster options do not apply to validate or preview", async () => {
    for (const command of ["validate", "preview"]) {
      const run = await tree.run([command, "plain.json", "--format", "png"]);
      expect(run.code).toBe(ExitCode.usage);
      expect(run.stderr).toContain(`option --format does not apply to ${command}`);
      const quality = await tree.run([command, "plain.json", "--quality", "80"]);
      expect(quality.code).toBe(ExitCode.usage);
      expect(quality.stderr).toContain(`option --quality does not apply to ${command}`);
    }
  });
});

describe("render to a raster image", () => {
  test("writes a PNG at twice the design size by default, nothing to standard output", async () => {
    const run = await tree.run([
      "render",
      "bound/design.json",
      "--data",
      "data.json",
      "--out",
      "out/card.png",
    ]);
    expect(run).toMatchObject({ code: ExitCode.ok, stdout: "", stderr: "" });
    const bytes = await readFile(join(tree.root, "out", "card.png"));
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(size(bytes)).toEqual([80, 48]);
  });

  test("writes a PNG of a design with a clip group three canvas heights below", async () => {
    await tree.file("far.json", {
      ...plainDesign,
      layers: [
        ...plainDesign.layers,
        {
          type: "group",
          y: 30,
          width: 10,
          height: 10,
          clip: true,
          children: [{ type: "rect", width: 10, height: 10, fill: "#cf222e" }],
        },
      ],
    });
    const run = await tree.run(["render", "far.json", "--out", "out/far.png"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stdout: "", stderr: "" });
    expect(size(await readFile(join(tree.root, "out", "far.png")))).toEqual([40, 20]);
  });

  test("--scale and --time shape a still PNG of an animated design", async () => {
    const run = await tree.run([
      "render",
      "animated.json",
      "--out",
      "out/a.png",
      "--scale",
      "1",
      "--time",
      "200",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    const bytes = await readFile(join(tree.root, "out", "a.png"));
    expect(size(bytes)).toEqual([20, 10]);
    expect(bytes.includes(Buffer.from("acTL"))).toBe(false);
  });

  test.each([
    ["webp", "a.webp", "RIFF"],
    ["apng", "a.png", "acTL"],
    ["gif", "a.gif", "NETSCAPE2.0"],
  ])("an animated design becomes an animated %s", async (format, file, marker) => {
    const run = await tree.run([
      "render",
      "animated.json",
      "--format",
      format,
      "--out",
      `out/${file}`,
      "--frame-rate",
      "10",
    ]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    const bytes = await readFile(join(tree.root, "out", file));
    expect(bytes.includes(Buffer.from(marker, "latin1"))).toBe(true);
  });

  test("a size over the limit exits 1 with a clear message and writes no file", async () => {
    await tree.file("wide.json", { ...plainDesign, canvas: { width: 3000, height: 10 } });
    const run = await tree.run(["render", "wide.json", "--out", "out/wide.png"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain(
      "wide.json: png export failed: the image would be 6000x20 pixels at scale 2; each side may be at most 4096",
    );
    expect(run.stdout).toBe("");
    expect(existsSync(join(tree.root, "out", "wide.png"))).toBe(false);
  });

  test("a failed export leaves an existing --out file as it was", async () => {
    await tree.file("out/wide.webp", "old");
    await tree.file("wide.json", { ...plainDesign, canvas: { width: 3000, height: 10 } });
    const run = await tree.run(["render", "wide.json", "--out", "out/wide.webp"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(await readFile(join(tree.root, "out", "wide.webp"), "utf8")).toBe("old");
  });

  test("--quality writes lossy WebP frames, the same bytes every time", async () => {
    const args = ["render", "animated.json", "--frame-rate", "10", "--quality", "70", "--out"];
    expect((await tree.run([...args, "out/one.webp"])).code).toBe(ExitCode.ok);
    expect((await tree.run([...args, "out/two.webp"])).code).toBe(ExitCode.ok);
    const one = await readFile(join(tree.root, "out", "one.webp"));
    expect(one.includes(Buffer.from("VP8 ", "latin1"))).toBe(true);
    expect(one.includes(Buffer.from("VP8L", "latin1"))).toBe(false);
    expect(one.equals(await readFile(join(tree.root, "out", "two.webp")))).toBe(true);
    const lossless = await tree.run([
      "render",
      "animated.json",
      "--frame-rate",
      "10",
      "--out",
      "out/plain.webp",
    ]);
    expect(lossless.code).toBe(ExitCode.ok);
    const plain = await readFile(join(tree.root, "out", "plain.webp"));
    expect(plain.includes(Buffer.from("VP8L", "latin1"))).toBe(true);
  });

  test("a default frame rate lowered to fit the limits is told on standard error, once", async () => {
    await tree.file("long.json", { ...animatedDesign, animation: { duration: 60_000 } });
    const run = await tree.run(["render", "long.json", "--scale", "1", "--out", "out/long.apng"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stdout: "" });
    expect(run.stderr).toBe(
      "long.json: apng sampled at 16 fps, the most the raster limits allow for a 60000 ms animation\n",
    );
  });

  test("no note when the default rate fits", async () => {
    const run = await tree.run(["render", "animated.json", "--out", "out/short.apng"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
  });

  test("an explicit frame rate that does not fit fails naming the rate that does, without a flag", async () => {
    await tree.file("long.json", { ...animatedDesign, animation: { duration: 60_000 } });
    const run = await tree.run([
      "render",
      "long.json",
      "--scale",
      "1",
      "--frame-rate",
      "30",
      "--out",
      "out/long.apng",
    ]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("lower the frame rate to 16 or less");
    expect(run.stderr).not.toContain("--");
    expect(existsSync(join(tree.root, "out", "long.apng"))).toBe(false);
  });

  test("two renders write the same bytes", async () => {
    const args = ["render", "animated.json", "--frame-rate", "10", "--out"];
    await tree.run([...args, "out/one.gif"]);
    await tree.run([...args, "out/two.gif"]);
    const one = await readFile(join(tree.root, "out", "one.gif"));
    expect(one.equals(await readFile(join(tree.root, "out", "two.gif")))).toBe(true);
  });
});
