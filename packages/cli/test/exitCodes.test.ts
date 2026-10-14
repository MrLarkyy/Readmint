import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { streamWriter } from "../src/streamWriter.js";
import { linkDirectory } from "./assetTree.js";
import { boundDesign, type CliTree, makeCliTree, plainDesign, png } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("plain.json", plainDesign);
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
  await tree.file("data.json", { v: 12 });
});

afterEach(async () => {
  await tree.remove();
});

describe("exit code 0", () => {
  test("a render that succeeds", async () => {
    const run = await tree.run(["render", "plain.json"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(run.stdout).toMatch(/^<svg /);
  });

  test("help and version", async () => {
    expect(await tree.run(["--help"])).toMatchObject({ code: 0, stderr: "" });
    expect(await tree.run(["help"])).toMatchObject({ code: 0, stderr: "" });
    expect(await tree.run(["--version"])).toMatchObject({ code: 0, stdout: "0.0.0\n" });
  });
});

describe("exit code 1", () => {
  test("a design that does not parse", async () => {
    await tree.file("broken.json", '{ "version": 0,');
    const run = await tree.run(["render", "broken.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toMatch(/^broken\.json:1:\d+: error parse at \/: /);
    expect(run.stdout).toBe("");
  });

  test("bindings without data", async () => {
    const run = await tree.run(["render", "bound/design.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toMatch(/^bound\/design\.json: error binding at \/layers\/0\/height: /);
  });

  test("an asset that does not exist", async () => {
    await tree.file("lost/design.json", boundDesign());
    const run = await tree.run(["render", "lost/design.json", "--data", "data.json"]);
    expect(run).toMatchObject({
      code: ExitCode.invalid,
      stderr:
        'lost/design.json: error asset at /assets/images/logo/src: asset "logo.png" does not exist in the design folder\n',
    });
  });

  test("a design file that is not UTF-8", async () => {
    await tree.file("latin1.json", new Uint8Array([0x7b, 0xe9, 0x7d]));
    const run = await tree.run(["validate", "latin1.json"]);
    expect(run).toMatchObject({
      code: ExitCode.invalid,
      stderr: "latin1.json: error parse at /: the file is not valid UTF-8\n",
    });
  });
});

describe("exit code 2", () => {
  test.each([
    [["frobnicate", "plain.json"], "unknown command"],
    [["render", "plain.json", "--colour", "red"], "unknown option"],
    [["preview", "plain.json", "--host", "0.0.0.0"], 'unknown option "--host"'],
    [["render"], "render needs a design file"],
    [[], "missing command"],
    [["render", "a.json", "b.json"], "unexpected argument"],
    [["preview", "plain.json", "--port", "70000"], "--port must be a number in 0..65535"],
    [["preview", "plain.json", "--port", "-1"], "--port must be a number in 0..65535"],
    [["preview", "plain.json", "--port", "8o"], "--port must be a number in 0..65535"],
    [["render", "plain.json", "--time", "1e3"], "--time must be milliseconds"],
    [["render", "plain.json", "--locale", "not a tag"], "is not a BCP 47 language tag"],
    [["render", "plain.json", "--locale", "pl"], "supported: en, de, fr, es, cs"],
    [["validate", "plain.json", "--out", "x.svg"], "--out does not apply to validate"],
    [["render", "plain.json", "--root"], "--root needs a value"],
    [["render", "plain.json", "--root", ".", "--root", "."], "is given twice"],
    [["render", "plain.json", "--help=yes"], "takes no value"],
  ])("%j", async (argv, message) => {
    const run = await tree.run(argv);
    expect(run.code).toBe(ExitCode.usage);
    expect(run.stderr).toContain(message);
    expect(run.stderr).toMatch(/\(see readmint --help\)\n$/);
    expect(run.stdout).toBe("");
  });
});

describe("exit code 3", () => {
  test("a design file that does not exist", async () => {
    const run = await tree.run(["render", "nothing.json"]);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: 'design file "nothing.json" does not exist\n',
    });
  });

  test.each([
    [["render", "../plain.json"]],
    [["render", "plain.json", "--root", "bound"]],
    [["render", ".", "--root", "."]],
  ])("a design file outside the root folder %j", async (argv) => {
    const run = await tree.run(argv);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: "the design file is outside the root folder; pass --root\n",
    });
  });

  test("a design file reached through a link that leaves the root folder", async () => {
    await tree.file("outside/design.json", plainDesign);
    await tree.file("root/.keep", "");
    await linkDirectory(`${tree.root}/outside`, `${tree.root}/root/link`);
    const run = await tree.run(["render", "root/link/design.json", "--root", "root"]);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: 'design file "link/design.json" resolves outside the root folder\n',
    });
  });

  test("a root folder that does not exist", async () => {
    const run = await tree.run(["render", "missing/plain.json", "--root", "missing"]);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: "the root folder cannot be opened (ENOENT)\n",
    });
  });

  test.each([
    ["not JSON", "{ v: 1 }", "is not valid UTF-8 JSON"],
    ["an array", "[1, 2]", "must be a JSON object of data namespaces"],
    ["null", "null", "must be a JSON object of data namespaces"],
    ["a bad key", '{ "Bad-Name": {} }', 'has the key "Bad-Name", which is not a data namespace'],
    ["a reserved key", '{ "true": {} }', 'has the key "true"'],
  ])("fixture data that is %s", async (_name, content, reason) => {
    await tree.file("fixture.json", content);
    const run = await tree.run(["render", "bound/design.json", "--data", "fixture.json"]);
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr.startsWith(`fixture data "fixture.json" ${reason}`), run.stderr).toBe(true);
    expect(run.stderr.indexOf("\n")).toBe(run.stderr.length - 1);
  });

  test("fixture data over 8 MiB", async () => {
    await tree.file("big.json", `{"v":"${"a".repeat(8 * 1024 * 1024)}"}`);
    const run = await tree.run(["render", "bound/design.json", "--data", "big.json"]);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: 'fixture data "big.json" is larger than 8388608 bytes\n',
    });
  });

  test("fixture data that does not exist or is a folder", async () => {
    expect(await tree.run(["render", "plain.json", "--data", "none.json"])).toMatchObject({
      code: ExitCode.input,
      stderr: 'fixture data "none.json" does not exist\n',
    });
    const folder = await tree.run(["render", "plain.json", "--data", "bound"]);
    expect(folder.code).toBe(ExitCode.input);
    expect(folder.stderr).toMatch(
      /^fixture data "bound" (is not a regular file|cannot be read \(EISDIR\))\n$/,
    );
  });

  test("--out into a folder that does not exist", async () => {
    const run = await tree.run(["render", "plain.json", "--out", "no/such/dir/out.svg"]);
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: 'cannot write "no/such/dir/out.svg" (ENOENT)\n',
    });
  });
});

describe("a failed write to standard output", () => {
  test.each([["render", "plain.json"], ["validate", "plain.json"], ["--help"], ["--version"]])(
    "%s: a system error code is exit code 3 without Node's text",
    async (...argv: string[]) => {
      const run = await tree.run(argv, {
        stdout: () =>
          Promise.reject(
            Object.assign(new Error("write EPIPE at /secret/path"), { code: "EPIPE" }),
          ),
      });
      expect(run).toMatchObject({
        code: ExitCode.input,
        stderr: "cannot write standard output (EPIPE)\n",
      });
    },
  );

  test("the error a process stream failed with, through streamWriter", async () => {
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      },
    });
    const run = await tree.run(["validate", "plain.json"], { stdout: streamWriter(stream) });
    expect(run).toMatchObject({
      code: ExitCode.input,
      stderr: "cannot write standard output (EPIPE)\n",
    });
  });

  test.each([["render"], ["validate"]])(
    "%s: standard error closed as well stays exit code 3",
    async (name: string) => {
      const broken = () =>
        Promise.reject(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      const run = await tree.run([name, "plain.json"], { stdout: broken, stderr: broken });
      expect(run.code).toBe(ExitCode.input);
    },
  );

  test("an error without a system code stays internal", async () => {
    const run = await tree.run(["validate", "plain.json"], {
      stdout: () => Promise.reject(new Error("stdout broke")),
    });
    expect(run).toMatchObject({
      code: ExitCode.internal,
      stderr: "internal error: stdout broke\n",
    });
  });
});

describe("exit code 70", () => {
  test("a standard output writer that throws", async () => {
    const run = await tree.run(["render", "plain.json"], {
      stdout: () => {
        throw new Error("stdout closed");
      },
    });
    expect(run).toMatchObject({
      code: ExitCode.internal,
      stderr: "internal error: stdout closed\n",
    });
  });

  test("a standard error writer that throws as well keeps the computed code", async () => {
    const run = await tree.run(["render", "plain.json"], {
      stdout: () => {
        throw new Error("stdout closed");
      },
      stderr: () => {
        throw new Error("stderr closed");
      },
    });
    expect(run.code).toBe(ExitCode.internal);
  });
});
