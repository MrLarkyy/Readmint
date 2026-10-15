import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import {
  importDesign,
  mountEditor,
  renderPreview,
  type EditorHandle,
  type SavedDesign,
} from "../src/index.js";
import { testFonts } from "./testFonts.js";

let root: HTMLElement;
let editor: EditorHandle;
let saved: SavedDesign[];

beforeEach(async () => {
  root = document.createElement("div");
  document.body.append(root);
  saved = [];
  editor = mountEditor(root, { save: (file) => saved.push(file) });
  await editor.settled();
});

afterEach(() => {
  editor.destroy();
  root.remove();
});

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

async function click(selector: string): Promise<void> {
  await userEvent.click(find(selector));
  await editor.settled();
}

/** Types into a property field and leaves it, which commits the change. */
async function setField(name: string, value: string): Promise<void> {
  await userEvent.fill(find(`[aria-label="Properties"] [name="${name}"]`), value);
  await userEvent.tab();
  await editor.settled();
}

async function upload(action: string, file: File): Promise<void> {
  await userEvent.upload(find(`input[data-action="${action}"]`), file);
  await editor.settled();
}

/** Presses at canvas point (`x`, `y`) on `target`, moves by (`dx`, `dy`) and releases. */
async function drag(target: Element, x: number, y: number, dx: number, dy: number): Promise<void> {
  const origin = find('[data-testid="overlay"]').getBoundingClientRect();
  const at = (px: number, py: number) => ({
    bubbles: true,
    button: 0,
    pointerId: 1,
    clientX: origin.left + px,
    clientY: origin.top + py,
  });
  target.dispatchEvent(new PointerEvent("pointerdown", at(x, y)));
  // The overlay redraws while dragging, so later events go where the pointer is: the page.
  document.body.dispatchEvent(new PointerEvent("pointermove", at(x + dx / 2, y + dy / 2)));
  document.body.dispatchEvent(new PointerEvent("pointerup", at(x + dx, y + dy)));
  await editor.settled();
}

function fontFile(font: { name: string; bytes: Uint8Array }): File {
  return new File([font.bytes.slice()], font.name, { type: "font/ttf" });
}

async function previewSvg(): Promise<string> {
  const src = (find("img") as HTMLImageElement).src;
  expect(src.startsWith("blob:")).toBe(true);
  return (await fetch(src)).text();
}

test("a design made in the editor exports to the file whose render the preview shows", async () => {
  await click('[data-action="add-rect"]');
  expect(editor.state.design.layers).toEqual([
    { type: "rect", id: "rect1", x: 20, y: 20, width: 120, height: 60, fill: "#d0d7de" },
  ]);

  // Drag the rect by its body: whole-number moves.
  await drag(find('[data-testid="overlay"]'), 50, 50, 30.4, 15.2);
  expect(editor.state.design.layers[0]).toMatchObject({ x: 50, y: 35 });

  // Resize it by its bottom-right handle.
  await drag(find('[data-handle="se"]'), 170, 95, 20, 10);
  expect(editor.state.design.layers[0]).toMatchObject({ x: 50, y: 35, width: 140, height: 70 });

  // A second layer, then the first selected in the tree and moved on top.
  await click('[data-action="add-ellipse"]');
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  expect(editor.state.selection).toBe("/layers/0");
  await click('[data-pointer="/layers/0"] [data-action="move-forward"]');
  expect(editor.state.design.layers.map((layer) => layer.id)).toEqual(["ellipse1", "rect1"]);
  expect(editor.state.selection).toBe("/layers/1");

  // Clicking the canvas selects the topmost layer under the pointer, empty canvas clears it.
  await drag(find('[data-testid="overlay"]'), 30, 30, 0, 0);
  expect(editor.state.selection).toBe("/layers/0");
  await drag(find('[data-testid="overlay"]'), 390, 110, 0, 0);
  expect(editor.state.selection).toBeUndefined();

  // Edit the rect's fill in the property panel.
  await click('[data-pointer="/layers/1"] [data-action="select"]');
  await setField("fill", "#0969da");
  expect(editor.state.design.layers[1]).toMatchObject({ fill: "#0969da" });

  // Upload a font, add a text bound to fixture data.
  await upload("upload-font", fontFile(testFonts.ttf));
  expect(editor.state.design.assets?.fonts?.["Montserrat-Medium"]?.licence).toEqual({
    embedding: "allowed",
  });
  await click('[data-action="add-text"]');
  await setField("content", "{{repo.name}}");
  await upload(
    "load-fixture",
    new File([JSON.stringify({ repo: { name: "readmint" } })], "data.json", {
      type: "application/json",
    }),
  );
  expect(editor.state.data).toEqual({ repo: { name: "readmint" } });
  expect(editor.state.issues).toEqual([]);

  await click('[data-action="export"]');
  expect(saved).toHaveLength(1);
  const file = saved[0];
  if (file === undefined) return;
  expect(file.name).toBe("design.json");
  const imported = await importDesign(file.text);
  expect(imported).toEqual({ ok: true, value: editor.state.design });
  if (!imported.ok) return;

  const expected = renderPreview({
    design: imported.value,
    data: editor.state.data,
    sessionAssets: {},
  });
  expect(expected.ok).toBe(true);
  if (!expected.ok) return;
  expect(editor.svg).toBe(expected.svg);
  expect(await previewSvg()).toBe(expected.svg);
  expect(expected.svg).toContain("@font-face");
  // The render is only ever an image: its ids and styles never reach the page.
  expect(root.querySelector("svg")).toBeNull();
  expect(document.querySelector("svg")).toBeNull();
});

test("a bound coordinate is not dragged, and the issue says why", async () => {
  await click('[data-action="add-rect"]');
  await setField("x", "{{left}}");
  await upload(
    "load-fixture",
    new File([JSON.stringify({ left: 20 })], "data.json", { type: "application/json" }),
  );
  const before = editor.state.design;
  await drag(find('[data-testid="overlay"]'), 50, 50, 30, 30);
  expect(editor.state.design).toBe(before);
  expect(find('[aria-label="Issues"]').textContent).toContain("x is bound to data");
});

test("a font whose fsType forbids embedding stays restricted and is drawn as paths", async () => {
  await upload("upload-font", fontFile(testFonts.restricted));
  const embedding = find('[data-font="Montserrat-Restricted"] select') as HTMLSelectElement;
  expect(embedding.disabled).toBe(true);
  expect(embedding.value).toBe("restricted");
  expect(find('[data-font="Montserrat-Restricted"]').textContent).toContain("forbids embedding");

  await click('[data-action="add-text"]');
  const svg = await previewSvg();
  expect(svg).not.toContain("@font-face");
  expect(svg).toContain("<path");
  expect(editor.state.design.assets?.fonts?.["Montserrat-Restricted"]?.licence.embedding).toBe(
    "restricted",
  );
});

test("an imported design's restricted font is locked as well", async () => {
  await upload("upload-font", fontFile(testFonts.restricted));
  await click('[data-action="export"]');
  const text = saved[0]?.text ?? "";
  editor.destroy();
  editor = mountEditor(root);
  await upload("import", new File([text], "design.json", { type: "application/json" }));
  expect(editor.state.fontChecks).toEqual({
    "Montserrat-Restricted": { fsType: 2, embeddable: false },
  });
  const embedding = find('[data-font="Montserrat-Restricted"] select') as HTMLSelectElement;
  expect(embedding.disabled).toBe(true);
});
