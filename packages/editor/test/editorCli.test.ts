import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Reached through the workspace alias, not a dependency: no browser-side package may list the CLI.
import { ExitCode, runCli } from "@readmint/cli";
import { afterEach, beforeEach, expect, test } from "vitest";
import { exportDesign, importDesign, renderPreview } from "../src/index.js";
import { editorSession } from "./editorSession.js";

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
