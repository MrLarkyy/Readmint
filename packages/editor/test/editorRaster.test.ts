import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExitCode, runCli } from "@readmint/cli";
import { initRaster } from "@readmint/raster/browser";
import { resolveRasterWasm } from "@readmint/raster";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  attachAsset,
  chooseRender,
  createEditorState,
  effectiveDesign,
  exportDesign,
  importDesign,
  loadFixture,
  loadManifest,
  setPalette,
  setVariant,
  paletteEdits,
  type EditorState,
} from "../src/index.js";
import { profileFontFiles, profileSource } from "./profileFiles.js";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { renderRasterExport } from "../src/renderRasterExport.js";
import {
  appRasterPins,
  editorRasterPins,
  manifestRasterPins,
  pinKey,
} from "./editorRasterParity.js";
import { appSession, editorSession } from "./editorSession.js";
import { editState } from "./formatEdits.js";
import { manifestDesign, manifestRenders } from "./settingsDesign.js";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "readmint-editor-raster-"));
  const paths = resolveRasterWasm();
  await initRaster({ resvg: await readFile(paths.resvg), webp: await readFile(paths.webp) });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function cliRaster(
  restricted: boolean,
  format: "png" | "webp",
  state = editorSession(restricted),
): Promise<Uint8Array> {
  await writeFile(join(folder, "design.json"), exportDesign(state.design));
  await writeFile(join(folder, "data.json"), JSON.stringify(state.data));
  const code = await runCli(
    ["render", "design.json", "--data", "data.json", "--format", format, "--out", `out.${format}`],
    { cwd: folder, stdout: () => undefined, stderr: () => undefined },
  );
  expect(code).toBe(ExitCode.ok);
  return readFile(join(folder, `out.${format}`));
}

test.each([
  [false, "png"],
  [false, "webp"],
  [true, "png"],
  [true, "webp"],
] as const)(
  "the editor's export (restricted font: %s, %s) equals the CLI's bytes and the pin",
  async (restricted, format) => {
    const cli = await cliRaster(restricted, format);
    expect(sha(cli)).toBe(editorRasterPins[pinKey(restricted, format)]);
    const state = editorSession(restricted);
    const output = await renderRasterExport({
      design: state.design,
      data: state.data,
      sessionAssets: state.sessionAssets,
      format,
    });
    expect(Buffer.from(output.bytes).equals(cli)).toBe(true);
    expect(output.mimeType).toBe(format === "png" ? "image/png" : "image/webp");
  },
);

test("a design that does not render is refused with the renderer's message", async () => {
  const state = editorSession();
  const broken = {
    ...state.design,
    layers: [{ type: "text", x: 0, y: 0, content: "x", font: "missing" }],
  } as unknown as typeof state.design;
  await expect(
    renderRasterExport({ design: broken, data: {}, sessionAssets: {}, format: "png" }),
  ).rejects.toThrow();
});

test.each(["png", "webp"] as const)(
  "the CLI's %s of the design the built app's page makes is the pinned file",
  async (format) => {
    const cli = await cliRaster(false, format, appSession());
    expect(sha(cli)).toBe(appRasterPins[format]);
  },
);

describe("the export of a manifest render", () => {
  const renders = manifestRenders.renders.filter((entry) => entry.name === "card-a");

  function chosen(variant?: "dark"): EditorState {
    const loaded = loadManifest(createEditorState(manifestDesign), JSON.stringify({ renders }));
    const state = chooseRender(loaded, "card-a", "card.json");
    expect(state.issues).toEqual([]);
    return variant === undefined ? state : setVariant(state, variant);
  }

  async function editorBytes(state: EditorState, format: "png" | "webp"): Promise<Uint8Array> {
    const effective = effectiveDesign(state);
    expect(effective.issues).toEqual([]);
    const output = await renderRasterExport({
      design: effective.design,
      data: state.data,
      sessionAssets: state.sessionAssets,
      format,
    });
    return output.bytes;
  }

  test.each(["png", "webp"] as const)(
    "equals readmint render --manifest --format %s, file for file, and the pins",
    async (format) => {
      await writeFile(join(folder, "card.json"), exportDesign(manifestDesign));
      await writeFile(join(folder, "renders.json"), JSON.stringify({ renders }));
      const code = await runCli(
        ["render", "--manifest", "renders.json", "--out-dir", "out", "--format", format],
        { cwd: folder, stdout: () => undefined, stderr: () => undefined },
      );
      expect(code).toBe(ExitCode.ok);
      const names = await readdir(join(folder, "out"));
      const light = `card-a.${format}`;
      const dark = `card-a.dark.${format}`;
      expect(names.sort()).toEqual([dark, light]);
      const cliLight = await readFile(join(folder, "out", light));
      const cliDark = await readFile(join(folder, "out", dark));
      expect(sha(cliLight)).toBe(manifestRasterPins[light]);
      expect(Buffer.from(await editorBytes(chosen(), format)).equals(cliLight)).toBe(true);
      if (format === "webp") return;
      expect(sha(cliDark)).toBe(manifestRasterPins[dark]);
      expect(Buffer.from(await editorBytes(chosen("dark"), format)).equals(cliDark)).toBe(true);
    },
  );

  test("one profile render, dark, equals the CLI's PNG", async () => {
    const template = "horizon";
    const source = join(
      import.meta.dirname,
      "..",
      "..",
      "components",
      "templates",
      "profiles",
      template,
    );
    await cp(join(source, "fonts"), join(folder, "fonts"), { recursive: true });
    await cp(join(source, "repo.json"), join(folder, "repo.json"));
    const entry = { name: "repo-3", design: "repo.json", props: { slot: 2 }, variants: ["dark"] };
    await writeFile(join(folder, "renders.json"), JSON.stringify({ renders: [entry] }));
    await writeFile(join(folder, "data.json"), JSON.stringify(sampleProfileData()));
    const code = await runCli(
      [
        "render",
        "--manifest",
        "renders.json",
        "--out-dir",
        "out",
        "--format",
        "png",
        "--data",
        "data.json",
      ],
      { cwd: folder, stdout: () => undefined, stderr: () => undefined },
    );
    expect(code).toBe(ExitCode.ok);
    const cli = await readFile(join(folder, "out", "repo-3.dark.png"));

    const imported = await importDesign(profileSource(template, "repo-3"));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
    let state = createEditorState(imported.value);
    const files = profileFontFiles(template);
    for (const [id, font] of Object.entries(imported.value.assets?.fonts ?? {})) {
      state = attachAsset(state, "fonts", id, files[font.src] ?? new Uint8Array());
    }
    state = loadFixture(state, JSON.stringify(sampleProfileData()));
    state = loadManifest(state, JSON.stringify({ renders: [entry] }));
    state = setVariant(chooseRender(state, "repo-3", "repo.json"), "dark");
    expect(state.issues).toEqual([]);
    expect(Buffer.from(await editorBytes(state, "png")).equals(cli)).toBe(true);
  }, 120_000);
});

test("a palette colour edit renders the new colour, as the same colour written in the layer", async () => {
  const state = editState();
  const entries = paletteEdits.paletteEntries(state.design.palette);
  const edited = setPalette(state, paletteEdits.setColour(entries, "light", "bg", "#ff0000"));
  expect(edited.issues).toEqual([]);
  const render = (design: EditorState["design"]) =>
    renderRasterExport({ design, data: {}, sessionAssets: {}, format: "png" });
  const before = await render(state.design);
  const after = await render(edited.design);
  expect(Buffer.from(after.bytes).equals(Buffer.from(before.bytes))).toBe(false);
  const literal = {
    ...state.design,
    canvas: { ...state.design.canvas, background: "#ff0000" },
  } as EditorState["design"];
  const direct = await render(literal);
  expect(Buffer.from(after.bytes).equals(Buffer.from(direct.bytes))).toBe(true);
});
