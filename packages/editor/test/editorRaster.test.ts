import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExitCode, runCli } from "@readmint/cli";
import { initRaster } from "@readmint/raster/browser";
import { resolveRasterWasm } from "@readmint/raster";
import { afterEach, beforeEach, expect, test } from "vitest";
import { exportDesign } from "../src/index.js";
import { renderRasterExport } from "../src/renderRasterExport.js";
import { appRasterPins, editorRasterPins, pinKey } from "./editorRasterParity.js";
import { appSession, editorSession } from "./editorSession.js";

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
