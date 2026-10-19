import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Reached through the workspace alias, not a dependency: no browser-side package may list the CLI.
import { ExitCode, runCli } from "@readmint/cli";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  chooseRender,
  chooseSection,
  createEditorState,
  effectiveDesign,
  exportDesign,
  importDesign,
  exportSettings,
  loadManifest,
  loadSettings,
  renderPreview,
  setLayerProperty,
  setLayerTrack,
  setSettingsProp,
  setVariant,
} from "../src/index.js";
import { editorSession, imageSession } from "./editorSession.js";
import { editState, rectPointer } from "./formatEdits.js";
import {
  manifestDesign,
  manifestRenders,
  settingsDesign,
  settingsText,
  themeDesign,
} from "./settingsDesign.js";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "readmint-editor-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function cliRender(
  designText: string,
  data: unknown,
): Promise<{ svg: string; stderr: string }> {
  await writeFile(join(folder, "design.json"), designText);
  await writeFile(join(folder, "data.json"), JSON.stringify(data));
  let stdout = "";
  let stderr = "";
  const code = await runCli(["render", "design.json", "--data", "data.json"], {
    cwd: folder,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  expect(code).toBe(ExitCode.ok);
  return { svg: stdout, stderr };
}

test.each([
  ["an embedded font", false],
  ["a font whose fsType forbids embedding", true],
])(
  "the exported design with %s renders in the CLI to the preview bytes",
  async (_name, restricted) => {
    const state = editorSession(restricted);
    const preview = renderPreview(state);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const { svg, stderr } = await cliRender(exportDesign(state.design), state.data);
    expect(svg).toBe(preview.svg);
    expect(svg.includes("@font-face")).toBe(!restricted);
    // The CLI prints the warnings the editor lists under the preview.
    expect(stderr.includes("font-not-embeddable")).toBe(restricted);
    expect(preview.warnings.map((warning) => warning.code)).toEqual(
      restricted ? ["font-not-embeddable"] : [],
    );
  },
);

test("the exported design re-imports to the same design", async () => {
  const state = editorSession();
  const imported = await importDesign(exportDesign(state.design));
  expect(imported).toEqual({ ok: true, value: state.design });
});

test("the exported design with an uploaded image renders in the CLI to the preview bytes", async () => {
  const state = imageSession();
  const preview = renderPreview(state);
  expect(preview.ok).toBe(true);
  if (!preview.ok) return;
  const { svg } = await cliRender(exportDesign(state.design), state.data);
  expect(svg).toBe(preview.svg);
  expect(svg).toContain('href="data:image/png;base64,');
  expect(await importDesign(exportDesign(state.design))).toEqual({ ok: true, value: state.design });
});

test("the preview with a settings section equals readmint render --props on the exported design", async () => {
  const loaded = loadSettings(createEditorState(settingsDesign), settingsText, "header");
  const state = chooseSection(loaded, "header");
  const { design, issues } = effectiveDesign(state);
  expect(issues).toEqual([]);
  const preview = renderPreview({ design, data: state.data, sessionAssets: state.sessionAssets });
  expect(preview.ok).toBe(true);
  if (!preview.ok) return;
  await writeFile(join(folder, "header.json"), exportDesign(state.design));
  await writeFile(join(folder, "settings.json"), settingsText);
  let stdout = "";
  const code = await runCli(["render", "header.json", "--props", "settings.json"], {
    cwd: folder,
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => undefined,
  });
  expect(code).toBe(ExitCode.ok);
  expect(stdout).toBe(preview.svg);
});

test("an edited and exported settings file renders in the CLI to the preview bytes and re-imports to the same state", async () => {
  const loaded = chooseSection(
    loadSettings(createEditorState(settingsDesign), settingsText, "header"),
    "header",
  );
  const edited = setSettingsProp(loaded, "color", "#0a0b0c");
  expect(edited.issues).toEqual([]);
  const { design, issues } = effectiveDesign(edited);
  expect(issues).toEqual([]);
  const preview = renderPreview({ design, data: edited.data, sessionAssets: edited.sessionAssets });
  expect(preview.ok).toBe(true);
  if (!preview.ok) return;
  const exported = exportSettings(edited.settings ?? { sections: {} });
  await writeFile(join(folder, "header.json"), exportDesign(edited.design));
  await writeFile(join(folder, "settings.json"), exported);
  let stdout = "";
  const code = await runCli(["render", "header.json", "--props", "settings.json"], {
    cwd: folder,
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => undefined,
  });
  expect(code).toBe(ExitCode.ok);
  expect(stdout).toBe(preview.svg);
  const again = loadSettings(createEditorState(settingsDesign), exported, "header");
  expect(again.settings?.sections).toEqual(edited.settings?.sections);
  expect(again.settings?.section).toBe("header");
});

async function cli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd: folder,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  expect(code).toBe(ExitCode.ok);
  return { stdout, stderr };
}

function previewOf(state: ReturnType<typeof createEditorState>): string {
  const { design, issues } = effectiveDesign(state);
  expect(issues).toEqual([]);
  const preview = renderPreview({ design, data: state.data, sessionAssets: state.sessionAssets });
  if (!preview.ok) throw new Error("preview failed");
  return preview.svg;
}

test("the dark variant preview equals readmint render --variant dark, with and without a section", async () => {
  await writeFile(join(folder, "card.json"), exportDesign(themeDesign));
  const dark = setVariant(createEditorState(themeDesign), "dark");
  const light = await cli(["render", "card.json"]);
  expect(previewOf(dark)).toBe((await cli(["render", "card.json", "--variant", "dark"])).stdout);
  expect(previewOf(dark)).not.toBe(light.stdout);
  expect(previewOf(createEditorState(themeDesign))).toBe(light.stdout);

  const text = '{"card": {"w": 9}}';
  await writeFile(join(folder, "settings.json"), text);
  const state = chooseSection(loadSettings(dark, text, "card"), "card");
  const withProps = await cli([
    "render",
    "card.json",
    "--variant",
    "dark",
    "--props",
    "settings.json",
  ]);
  expect(previewOf(state)).toBe(withProps.stdout);
});

test("a section that sets theme wins over the variant as in the CLI, which prints the override", async () => {
  await writeFile(join(folder, "card.json"), exportDesign(themeDesign));
  const text = '{"card": {"theme": "light", "w": 9}}';
  await writeFile(join(folder, "settings.json"), text);
  const state = chooseSection(
    loadSettings(setVariant(createEditorState(themeDesign), "dark"), text, "card"),
    "card",
  );
  const run = await cli(["render", "card.json", "--variant", "dark", "--props", "settings.json"]);
  expect(previewOf(state)).toBe(run.stdout);
  expect(run.stderr).toContain('sets "theme", which overrides the dark variant');
  expect(effectiveDesign(state).warnings[0]?.message).toContain("overrides the dark variant");
});

test("a dark twin imported with Light renders the CLI's bytes for the twin", async () => {
  const twin = exportDesign({
    ...themeDesign,
    layers: [{ type: "component", ref: "box", props: { theme: "dark" } }],
  });
  await writeFile(join(folder, "card.dark.json"), twin);
  const imported = await importDesign(twin);
  if (!imported.ok) throw new Error("twin does not import");
  expect(previewOf(createEditorState(imported.value))).toBe(
    (await cli(["render", "card.dark.json"])).stdout,
  );
});

describe("a manifest render", () => {
  const renders = manifestRenders.renders.filter((entry) => entry.design === "card.json");
  const settings = JSON.stringify({ "card-a": { slot: 3 } });

  function renderState(name: string, variant?: "dark") {
    const manifest = loadManifest(createEditorState(manifestDesign), JSON.stringify({ renders }));
    const chosen = chooseRender(loadSettings(manifest, settings), name, "card.json");
    expect(chosen.issues).toEqual([]);
    return variant === undefined ? chosen : setVariant(chosen, variant);
  }

  async function files(extra: string[] = []): Promise<Record<string, string>> {
    await writeFile(join(folder, "card.json"), exportDesign(manifestDesign));
    await writeFile(join(folder, "renders.json"), JSON.stringify({ renders }));
    await writeFile(join(folder, "settings.json"), settings);
    await writeFile(join(folder, "data.json"), "{}");
    await cli([
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "out",
      "--format",
      "svg",
      "--data",
      "data.json",
      "--props",
      "settings.json",
      ...extra,
    ]);
    const names = await readdir(join(folder, "out"));
    return Object.fromEntries(
      await Promise.all(
        names.map(async (name): Promise<[string, string]> => [
          name,
          await readFile(join(folder, "out", name), "utf8"),
        ]),
      ),
    );
  }

  test("every file readmint render --manifest writes equals the editor's preview", async () => {
    const written = await files();
    expect(Object.keys(written).sort()).toEqual([
      "card-a.dark.svg",
      "card-a.svg",
      "card-b.svg",
      "plain.svg",
      "themed.svg",
    ]);
    expect(previewOf(renderState("card-a"))).toBe(written["card-a.svg"]);
    expect(previewOf(renderState("card-a", "dark"))).toBe(written["card-a.dark.svg"]);
    expect(previewOf(renderState("card-b"))).toBe(written["card-b.svg"]);
    expect(previewOf(renderState("plain"))).toBe(written["plain.svg"]);
    expect(previewOf(renderState("themed"))).toBe(written["themed.svg"]);
    expect(written["card-a.svg"]).not.toBe(written["card-b.svg"]);
    expect(written["card-a.dark.svg"]).not.toBe(written["card-a.svg"]);
  });

  test("a run variant that clashes with the props of a render without variants fails in both", async () => {
    await writeFile(join(folder, "card.json"), exportDesign(manifestDesign));
    await writeFile(join(folder, "renders.json"), JSON.stringify({ renders }));
    let stderr = "";
    const code = await runCli(
      ["render", "--manifest", "renders.json", "--out-dir", "out", "--variant", "dark"],
      {
        cwd: folder,
        stdout: () => undefined,
        stderr: (text) => {
          stderr += text;
        },
      },
    );
    expect(code).toBe(ExitCode.invalid);
    const issue = effectiveDesign(setVariant(renderState("themed"), "dark")).issues[0];
    expect(issue?.source).toBe("manifest");
    const pointer = issue?.path ?? "";
    expect(pointer).toBe("/renders/3/props/theme");
    expect(stderr).toContain(pointer);
    const sentence = "the prop theme is also set by the dark variant; set it in one place";
    expect(stderr).toContain(sentence);
    expect(issue?.message).toBe(`manifest ${pointer}: ${sentence}`);
  });
});

describe("the preview at a time", () => {
  const animated = () =>
    setLayerTrack(
      setLayerProperty(editState(), rectPointer, "orbit", undefined),
      rectPointer,
      "x",
      {
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 1, value: 90 },
        ],
        duration: 333,
        cycles: 3,
      },
    );

  async function cliAt(designText: string, time?: number): Promise<string> {
    await writeFile(join(folder, "design.json"), designText);
    let stdout = "";
    const code = await runCli(
      ["render", "design.json", ...(time === undefined ? [] : ["--time", String(time)])],
      {
        cwd: folder,
        stdout: (text) => {
          stdout += text;
        },
        stderr: () => undefined,
      },
    );
    expect(code).toBe(ExitCode.ok);
    return stdout;
  }

  test.each([0, 1234, 500, 1000])("renderPreview at %i ms equals render --time", async (time) => {
    const state = animated();
    expect(state.issues).toEqual([]);
    const preview = renderPreview({
      design: state.design,
      data: state.data,
      sessionAssets: state.sessionAssets,
      time,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.svg).not.toContain("@keyframes");
    expect(await cliAt(exportDesign(state.design), time)).toBe(preview.svg);
  });

  test("without a time it is the animated SVG of a plain render", async () => {
    const state = animated();
    const preview = renderPreview({
      design: state.design,
      data: state.data,
      sessionAssets: state.sessionAssets,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.svg).toContain("@keyframes");
    expect(await cliAt(exportDesign(state.design))).toBe(preview.svg);
  });
});
