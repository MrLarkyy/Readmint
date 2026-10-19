import resvgUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import webpUrl from "wasm-webp/dist/esm/webp-wasm.wasm?url";
import { DesignLimits, type Design } from "@readmint/format";
import { initRaster } from "@readmint/raster/browser";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createEditorState,
  importDesign,
  mountEditor,
  uploadFont,
  type EditorHandle,
  type SavedDesign,
  type SavedImage,
} from "../src/index.js";
import { renderRasterExport } from "../src/renderRasterExport.js";
import { editorRasterPins, pinKey } from "./editorRasterParity.js";
import { editorSession } from "./editorSession.js";
import { testFonts } from "./testFonts.js";

/** A cold raster worker fetches 3 MB of WebAssembly and compiles it: allow for a slow machine. */
const slow = 180_000;

let root: HTMLElement;
let editor: EditorHandle;
let designs: SavedDesign[];
let images: SavedImage[];

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  designs = [];
  images = [];
  editor = mountEditor(root, {
    save: (file) => designs.push(file),
    saveImage: (file) => images.push(file),
  });
});

afterEach(() => {
  editor.destroy();
  root.remove();
});

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function wasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cannot load ${url}`);
  return response.arrayBuffer();
}

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

test.each([
  [false, "png"],
  [false, "webp"],
  [true, "png"],
  [true, "webp"],
] as const)(
  "renderRasterExport in Chromium (restricted font: %s, %s) makes the bytes the CLI makes",
  async (restricted, format) => {
    await initRaster({ resvg: await wasm(resvgUrl), webp: await wasm(webpUrl) });
    const state = editorSession(restricted);
    const output = await renderRasterExport({
      design: state.design,
      data: state.data,
      sessionAssets: state.sessionAssets,
      format,
    });
    expect(await sha256(output.bytes)).toBe(editorRasterPins[pinKey(restricted, format)]);
  },
  slow,
);

test.each([
  [false, "png", "image/png"],
  [false, "webp", "image/webp"],
  [true, "png", "image/png"],
  [true, "webp", "image/webp"],
] as const)(
  "the mounted editor's export button (restricted font: %s, %s) saves the CLI's bytes from a real worker",
  async (restricted, format, mimeType) => {
    editor.dispatch(() => editorSession(restricted));
    await editor.settled();
    await userEvent.click(find(`[data-action="export-${format}"]`));
    await editor.settled();
    expect(editor.state.issues).toEqual([]);
    expect(images).toHaveLength(1);
    const [image] = images;
    expect(image?.name).toBe(`design.${format}`);
    expect(image?.mimeType).toBe(mimeType);
    expect(await sha256(image?.bytes ?? new Uint8Array())).toBe(
      editorRasterPins[pinKey(restricted, format)],
    );
  },
  slow,
);

test("the YAML export saves design.yaml, which re-imports to the design", async () => {
  const state = editorSession();
  editor.dispatch(() => state);
  await editor.settled();
  await userEvent.click(find('[data-action="export-yaml"]'));
  await editor.settled();
  expect(designs).toHaveLength(1);
  expect(designs[0]?.name).toBe("design.yaml");
  expect(await importDesign(designs[0]?.text ?? "")).toEqual({ ok: true, value: state.design });
});

test("the JSON export keeps its button and file name", async () => {
  await userEvent.click(find('[data-action="export"]'));
  await editor.settled();
  expect(designs.map((file) => file.name)).toEqual(["design.json"]);
});

test("a YAML export over the YAML limit reports an export issue and changes nothing", async () => {
  const padded = new Uint8Array(Math.ceil((DesignLimits.maxYamlSourceLength * 3) / 4));
  padded.set(testFonts.ttf.bytes);
  const large = uploadFont(editorSession(), { name: "Large.ttf", bytes: padded });
  editor.dispatch(() => large);
  await editor.settled();
  const design = editor.state.design;
  await userEvent.click(find('[data-action="export-yaml"]'));
  await editor.settled();
  expect(designs).toEqual([]);
  expect(editor.state.design).toBe(design);
  expect(editor.state.issues.map((issue) => issue.source)).toEqual(["export"]);
  expect(editor.state.issues[0]?.message).toContain("export JSON instead");
});

test("a second raster click while one runs is reported and the first still saves", async () => {
  editor.dispatch(() => editorSession());
  await editor.settled();
  find('[data-action="export-png"]').click();
  find('[data-action="export-webp"]').click();
  expect(editor.state.issues.map((issue) => issue.source)).toEqual(["export"]);
  await editor.settled();
  expect(images.map((image) => image.name)).toEqual(["design.png"]);
});

test(
  "Export PNG with the transport paused at 400 ms saves that frame; playing it saves the first",
  async () => {
    await initRaster({ resvg: await wasm(resvgUrl), webp: await wasm(webpUrl) });
    const moving = {
      version: 0,
      canvas: { width: 100, height: 40 },
      animation: { duration: 1000 },
      layers: [
        {
          type: "rect",
          width: 20,
          height: 10,
          fill: "#000000",
          animate: {
            x: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 60 },
              ],
            },
          },
        },
      ],
    } as unknown as Design;
    editor.dispatch(() => createEditorState(moving));
    await editor.settled();
    const input = (name: string) => find(`[name="${name}"]`) as HTMLInputElement;
    const exportPng = async () => {
      await userEvent.click(find('[data-action="export-png"]'));
      await editor.settled();
      expect(editor.state.issues).toEqual([]);
    };
    const expected = async (time?: number) => {
      const { design, data, sessionAssets } = editor.state;
      const output = await renderRasterExport({
        design,
        data,
        sessionAssets,
        format: "png",
        ...(time === undefined ? {} : { time }),
      });
      return sha256(output.bytes);
    };
    await userEvent.click(find('[data-action="toggle-play"]'));
    await editor.settled();
    await userEvent.fill(input("time"), "400");
    await userEvent.tab();
    await editor.settled();
    await exportPng();
    expect(await sha256(images[0]?.bytes ?? new Uint8Array())).toBe(await expected(400));
    expect(await expected(400)).not.toBe(await expected(0));
    await userEvent.click(find('[data-action="toggle-play"]'));
    await editor.settled();
    await exportPng();
    expect(await sha256(images[1]?.bytes ?? new Uint8Array())).toBe(await expected());
  },
  slow,
);
