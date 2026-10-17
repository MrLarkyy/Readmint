import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Reached through the workspace alias, not a dependency: no browser-side package may list the CLI.
import { ExitCode, runCli } from "@readmint/cli";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  chooseSection,
  createEditorState,
  effectiveDesign,
  exportDesign,
  importDesign,
  exportSettings,
  loadSettings,
  renderPreview,
  setSettingsProp,
  setVariant,
} from "../src/index.js";
import { editorSession, imageSession } from "./editorSession.js";
import { settingsDesign, settingsText, themeDesign } from "./settingsDesign.js";

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
