import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ExitCode, type ImageFetch, loadDesignAssets, loadDesignFile } from "../src/index.js";
import { parseCliArgs } from "../src/parseCliArgs.js";
import { watchedAssetPaths } from "../src/watchedAssetPaths.js";
import { type CliTree, makeCliTree, png } from "./cliTree.js";

const avatar = "https://avatars.githubusercontent.com/u/1?v=4";

function avatarDesign(src: string): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24 },
    assets: { images: { avatar: { src } } },
    layers: [{ type: "image", asset: "avatar", x: 4, y: 4, width: 16, height: 16 }],
  };
}

let tree: CliTree;
let calls: { url: string; init: RequestInit }[];
let fetch: ImageFetch;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound.json", avatarDesign("{{ github.avatarUrl }}"));
  await tree.file("file.json", avatarDesign("avatar.png"));
  await tree.file("avatar.png", png);
  await tree.file("data.json", { github: { avatarUrl: avatar } });
  calls = [];
  fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await tree.remove();
});

test("render --fetch-images inlines the bound image, byte for byte as the same file asset", async () => {
  const bound = await tree.run(["render", "bound.json", "--data", "data.json", "--fetch-images"], {
    fetch,
  });
  const file = await tree.run(["render", "file.json", "--data", "data.json"]);
  expect(bound).toMatchObject({ code: ExitCode.ok, stderr: "" });
  expect(bound.stdout).toContain('href="data:image/png;base64,');
  expect(bound.stdout).not.toContain("https:");
  expect(bound.stdout).toBe(file.stdout);
  expect(calls.map((call) => call.url)).toEqual([avatar]);
});

test("without --fetch-images a bound image fails image-not-fetched and nothing is fetched", async () => {
  const global = vi.spyOn(globalThis, "fetch");
  const run = await tree.run(["render", "bound.json", "--data", "data.json"], { fetch });
  expect(run).toMatchObject({ code: ExitCode.invalid, stdout: "" });
  expect(run.stderr).toBe(
    'bound.json: error image-not-fetched at /assets/images/avatar/src: image asset "avatar" takes its src from data; pass --fetch-images to fetch it\n',
  );
  expect(calls).toEqual([]);
  expect(global).not.toHaveBeenCalled();
});

test("validate --fetch-images fetches and checks the bound image", async () => {
  const run = await tree.run(["validate", "bound.json", "--data", "data.json", "--fetch-images"], {
    fetch,
  });
  expect(run).toMatchObject({ code: ExitCode.ok, stdout: "bound.json: ok\n" });
  expect(calls).toHaveLength(1);
});

test("a refused host is one error line naming the code and the asset src", async () => {
  await tree.file("evil.json", { github: { avatarUrl: "https://evil.example/a.png" } });
  const run = await tree.run(["render", "bound.json", "--data", "evil.json", "--fetch-images"], {
    fetch,
  });
  expect(run.code).toBe(ExitCode.invalid);
  expect(run.stderr).toBe(
    'bound.json: error image-host at /assets/images/avatar/src: image asset "avatar": "https://evil.example/a.png": host "evil.example" is not allowed (allowed: avatars.githubusercontent.com)\n',
  );
  expect(calls).toEqual([]);
});

test("--fetch-images without --data is image-binding", async () => {
  const run = await tree.run(["render", "bound.json", "--fetch-images"], { fetch });
  expect(run.code).toBe(ExitCode.invalid);
  expect(run.stderr).toMatch(
    /^bound\.json: error image-binding at \/assets\/images\/avatar\/src: /,
  );
});

test("--fetch-images applies to render, validate and preview and takes no value", () => {
  for (const name of ["render", "validate", "preview"]) {
    expect(parseCliArgs([name, "d.json", "--fetch-images"])).toMatchObject({ fetchImages: true });
    expect(parseCliArgs([name, "d.json"])).not.toHaveProperty("fetchImages");
  }
  expect(() => parseCliArgs(["render", "d.json", "--fetch-images=yes"])).toThrow(
    "option --fetch-images takes no value",
  );
});

test("a bound src is no file: not read as an asset, not watched by the preview", async () => {
  const file = await loadDesignFile("bound.json", { cwd: tree.root });
  expect(await loadDesignAssets(file)).toEqual({ fonts: {}, images: {} });
  expect(watchedAssetPaths(file)).toEqual([]);
  const withFile = await loadDesignFile("file.json", { cwd: tree.root });
  expect(watchedAssetPaths(withFile)).toHaveLength(1);
});

test("validate without --data checks a bound image design and fetches nothing", async () => {
  const global = vi.spyOn(globalThis, "fetch");
  const run = await tree.run(["validate", "bound.json"], { fetch });
  expect(run).toMatchObject({ code: ExitCode.ok, stdout: "bound.json: ok\n", stderr: "" });
  expect(calls).toEqual([]);
  expect(global).not.toHaveBeenCalled();
});

test("render without --data fails missing-asset naming --fetch-images, fetching nothing", async () => {
  const run = await tree.run(["render", "bound.json"], { fetch });
  expect(run.code).toBe(ExitCode.invalid);
  expect(run.stderr).toMatch(
    /^bound\.json: error missing-asset at \/assets\/images\/avatar\/src: .*--fetch-images/,
  );
  expect(calls).toEqual([]);
});
