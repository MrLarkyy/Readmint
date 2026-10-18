import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Design } from "@readmint/format";
import {
  EditorLimits,
  importDesign,
  mountEditor,
  renderPreview,
  type EditorHandle,
  type SavedDesign,
} from "../src/index.js";
import { testFonts } from "./testFonts.js";
import { testImages } from "./testImages.js";

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

/** Remounts the editor on `design` and waits for its first preview. */
async function remount(design: Design): Promise<void> {
  editor.destroy();
  editor = mountEditor(root, { initial: design, save: (file) => saved.push(file) });
  await editor.settled();
}

test("after a failed render the canvas selects nothing until a render succeeds", async () => {
  await click('[data-action="add-rect"]');
  await setField("width", "{{missing}}");
  expect(find('[aria-label="Issues"]').textContent).toContain("preview:");
  await drag(find('[data-testid="overlay"]'), 390, 110, 0, 0);
  expect(editor.state.selection).toBeUndefined();
  // The image still shows the rect, but its box may no longer be where the design puts it.
  await drag(find('[data-testid="overlay"]'), 50, 50, 0, 0);
  expect(editor.state.selection).toBeUndefined();
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await setField("width", "120");
  await drag(find('[data-testid="overlay"]'), 390, 110, 0, 0);
  await drag(find('[data-testid="overlay"]'), 50, 50, 0, 0);
  expect(editor.state.selection).toBe("/layers/0");
});

const turnedGroup = (rotation: number, childRotation: number): Design => ({
  version: 0,
  canvas: { width: 300, height: 300 },
  layers: [
    {
      type: "group",
      x: 100,
      y: 100,
      width: 100,
      height: 40,
      rotation,
      children: [{ type: "rect", x: 0, y: 0, width: 40, height: 40, rotation: childRotation }],
    },
  ],
});

test("a drag in a turned group moves the layer along the group's axes, with the pointer", async () => {
  await remount(turnedGroup(90, 0));
  // The group turns 90 degrees about (150, 120): its child's centre (120, 120) lands at (150, 90).
  await drag(find('[data-testid="overlay"]'), 150, 90, 0, 0);
  expect(editor.state.selection).toBe("/layers/0/children/0");
  expect(root.querySelector("[data-handle]")).toBeNull();
  await drag(find('[data-testid="overlay"]'), 150, 90, 0, 12);
  // Down the canvas is the group's +x.
  expect(editor.state.design.layers[0]).toMatchObject({ children: [{ x: 12, y: 0 }] });
});

test("turns that cancel out on the canvas show no resize handles", async () => {
  await remount(turnedGroup(-90, 90));
  // Turned -90 about (150, 120), the child's centre lands at (150, 150).
  await drag(find('[data-testid="overlay"]'), 150, 150, 0, 0);
  expect(editor.state.selection).toBe("/layers/0/children/0");
  expect(root.querySelector(".rm-selection")).not.toBeNull();
  expect(root.querySelector("[data-handle]")).toBeNull();
  await remount(turnedGroup(0, 0));
  await drag(find('[data-testid="overlay"]'), 120, 120, 0, 0);
  expect(root.querySelectorAll("[data-handle]")).toHaveLength(4);
});

test("a file for a path-sourced asset is refused by its size before it is read", async () => {
  await remount({
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { images: { logo: { src: "logo.png" } } },
    layers: [],
  });
  await userEvent.upload(
    find('input[data-attach="images/logo"]'),
    new File([new Uint8Array(4_194_305)], "logo.png", { type: "image/png" }),
  );
  await editor.settled();
  expect(editor.state.sessionAssets).toEqual({});
  expect(find('[aria-label="Issues"]').textContent).toContain(
    'image "logo" is 4194305 bytes, more than the 4194304 allowed',
  );
});

function button(action: string): HTMLButtonElement {
  return find(`button[data-action="${action}"]`) as HTMLButtonElement;
}

async function press(keys: string): Promise<void> {
  await userEvent.keyboard(keys);
  await editor.settled();
}

test("Ctrl+Z undoes an edit and its preview, Ctrl+Shift+Z and Ctrl+Y redo it", async () => {
  expect(button("undo").disabled).toBe(true);
  expect(button("redo").disabled).toBe(true);
  await click('[data-action="add-rect"]');
  const added = editor.state.design;
  const addedSvg = await previewSvg();
  expect(button("undo").disabled).toBe(false);
  await drag(find('[data-testid="overlay"]'), 50, 50, 30, 15);
  expect(editor.state.design.layers[0]).toMatchObject({ x: 50, y: 35 });
  const moved = editor.state.design;
  const movedSvg = await previewSvg();

  // A drag is one edit: one undo puts the rect back where it was, preview included.
  await press("{Control>}z{/Control}");
  expect(editor.state.design).toBe(added);
  expect(editor.state.selection).toBe("/layers/0");
  expect(await previewSvg()).toBe(addedSvg);
  expect(button("redo").disabled).toBe(false);

  await press("{Control>}{Shift>}z{/Shift}{/Control}");
  expect(editor.state.design).toBe(moved);
  expect(await previewSvg()).toBe(movedSvg);
  expect(button("redo").disabled).toBe(true);

  await press("{Control>}z{/Control}");
  await press("{Control>}y{/Control}");
  expect(editor.state.design).toBe(moved);

  // The toolbar does the same; past the oldest edit there is nothing left to undo.
  await click('[data-action="undo"]');
  await click('[data-action="undo"]');
  expect(editor.state.design.layers).toEqual([]);
  expect(button("undo").disabled).toBe(true);
  await press("{Control>}z{/Control}");
  expect(editor.state.design.layers).toEqual([]);
  await click('[data-action="redo"]');
  expect(editor.state.design).toBe(added);
});

test("Ctrl+Z in a text field is the field's own undo, never the editor's", async () => {
  await click('[data-action="add-rect"]');
  const design = editor.state.design;
  await userEvent.click(find('[aria-label="Properties"] [name="fill"]'));
  await press("{Control>}z{/Control}");
  expect(editor.state.design).toBe(design);
  expect(button("undo").disabled).toBe(false);
});

test("an uploaded image is embedded in the design and previewed as the renderer renders it", async () => {
  await upload(
    "upload-image",
    new File([testImages.png.bytes.slice()], "pattern.png", { type: "image/png" }),
  );
  expect(editor.state.issues).toEqual([]);
  const src = editor.state.design.assets?.images?.pattern?.src ?? "";
  expect(src.startsWith("data:image/png;base64,")).toBe(true);
  expect(editor.state.design.layers[0]).toMatchObject({
    type: "image",
    asset: "pattern",
    width: 24,
    height: 16,
  });
  expect(editor.state.selection).toBe("/layers/0");
  const expected = renderPreview(editor.state);
  expect(expected.ok).toBe(true);
  if (!expected.ok) return;
  expect(editor.svg).toBe(expected.svg);
  expect(await previewSvg()).toBe(expected.svg);
  expect(find('[data-image="pattern"]').textContent).toBe("image pattern: embedded in the design");
  expect(root.querySelector('input[data-attach="images/pattern"]')).toBeNull();

  // Undo takes the asset and the layer away together.
  await click('[data-action="undo"]');
  expect(editor.state.design.assets?.images).toBeUndefined();
  expect(editor.state.design.layers).toEqual([]);
});

test("an oversized image is refused before it is read, a malformed one with its reason", async () => {
  const read = vi.spyOn(Blob.prototype, "arrayBuffer");
  try {
    const design = editor.state.design;
    await upload(
      "upload-image",
      new File([new Uint8Array(EditorLimits.maxImageBytes + 1)], "big.png", { type: "image/png" }),
    );
    expect(read).not.toHaveBeenCalled();
    expect(editor.state.design).toBe(design);
    expect(find('[aria-label="Issues"]').textContent).toContain(
      'image "big.png" is 4194305 bytes, more than the 4194304 an image may have',
    );

    await upload(
      "upload-image",
      new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "x.png", { type: "image/png" }),
    );
    // The spy sees a read: the oversized file above was refused without one.
    expect(read).toHaveBeenCalledTimes(1);
    expect(editor.state.design).toBe(design);
    expect(find('[aria-label="Issues"]').textContent).toContain(
      'image "x.png" cannot be used: not a PNG, JPEG, GIF or WebP image',
    );
    expect(button("undo").disabled).toBe(true);
  } finally {
    read.mockRestore();
  }
});

test("New and Import start an empty history", async () => {
  await click('[data-action="add-rect"]');
  await click('[data-action="export"]');
  await click('[data-action="add-ellipse"]');
  expect(button("undo").disabled).toBe(false);
  await upload(
    "import",
    new File([saved[0]?.text ?? ""], "design.json", { type: "application/json" }),
  );
  const imported = editor.state.design;
  expect(imported.layers).toHaveLength(1);
  expect(button("undo").disabled).toBe(true);
  editor.undo();
  expect(editor.state.design).toBe(imported);

  await click('[data-action="add-rect"]');
  await click('[data-action="new"]');
  expect(editor.state.design.layers).toEqual([]);
  expect(button("undo").disabled).toBe(true);
  expect(button("redo").disabled).toBe(true);
});

/** Ctrl (or Cmd) with a key, sent to the document as a keyboard layout would report it. */
function shortcut(key: string, code: string, shiftKey = false): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, code, ctrlKey: true, shiftKey, bubbles: true }),
  );
}

test("an undo during a drag drops the drag: releasing the pointer changes nothing", async () => {
  await click('[data-action="add-rect"]');
  const added = editor.state.design;
  await drag(find('[data-testid="overlay"]'), 50, 50, 30, 15);
  const origin = find('[data-testid="overlay"]').getBoundingClientRect();
  const at = (x: number, y: number) => ({
    bubbles: true,
    button: 0,
    pointerId: 1,
    clientX: origin.left + x,
    clientY: origin.top + y,
  });
  find('[data-testid="overlay"]').dispatchEvent(new PointerEvent("pointerdown", at(60, 50)));
  document.body.dispatchEvent(new PointerEvent("pointermove", at(80, 60)));
  await press("{Control>}z{/Control}");
  expect(editor.state.design).toBe(added);
  document.body.dispatchEvent(new PointerEvent("pointerup", at(100, 70)));
  await editor.settled();
  expect(editor.state.design).toBe(added);
  expect(editor.state.issues).toEqual([]);
  // Nothing new was recorded: the undone move is still there to redo.
  expect(button("redo").disabled).toBe(false);
});

test("a drag that rounds to no move is no undo entry", async () => {
  await click('[data-action="add-rect"]');
  const added = editor.state.design;
  await drag(find('[data-testid="overlay"]'), 50, 50, 0.2, 0.3);
  expect(editor.state.design).toBe(added);
  await click('[data-action="undo"]');
  expect(editor.state.design.layers).toEqual([]);
});

test("shortcuts follow the layout's letter, and the key's place on a non-Latin layout", async () => {
  await click('[data-action="add-rect"]');
  const added = editor.state.design;
  // Cyrillic: the key in the Z place types "я", in the Y place "н".
  shortcut("я", "KeyZ");
  await editor.settled();
  expect(editor.state.design.layers).toEqual([]);
  shortcut("н", "KeyY");
  await editor.settled();
  expect(editor.state.design).toBe(added);
  shortcut("Я", "KeyZ");
  await editor.settled();
  shortcut("Я", "KeyZ", true);
  await editor.settled();
  expect(editor.state.design).toBe(added);
  // QWERTZ: "z" sits in the Y place and is still undo.
  shortcut("z", "KeyY");
  await editor.settled();
  expect(editor.state.design.layers).toEqual([]);
});

test("destroy removes the shortcut listener", async () => {
  await click('[data-action="add-rect"]');
  const destroyed = editor;
  const design = destroyed.state.design;
  destroyed.destroy();
  shortcut("z", "KeyZ");
  expect(destroyed.state.design).toBe(design);
  editor = mountEditor(root, { save: (file) => saved.push(file) });
  await editor.settled();
});

test("embedded fonts and images, malformed ones included, need no file; path ones do", async () => {
  await remount({
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: {
      fonts: {
        bad: {
          family: "Bad",
          src: "data:font/ttf;base64,AAAAA",
          licence: { embedding: "allowed" },
        },
        local: { family: "Local", src: "fonts/local.ttf", licence: { embedding: "allowed" } },
      },
      images: {
        bad: { src: "data:image/png;base64,AAAAA" },
        logo: { src: "logo.png" },
        avatar: { src: "{{repo.avatar}}" },
      },
    },
    layers: [],
  });
  expect(root.querySelector('input[data-attach="fonts/bad"]')).toBeNull();
  expect(root.querySelector('input[data-attach="images/bad"]')).toBeNull();
  expect(find('[data-image="bad"]').textContent).toBe("image bad: embedded in the design");
  expect(root.querySelector('input[data-attach="fonts/local"]')).not.toBeNull();
  expect(root.querySelector('input[data-attach="images/logo"]')).not.toBeNull();
  expect(root.querySelector('input[data-attach="images/avatar"]')).toBeNull();
  expect(find(".rm-assets").textContent).toContain("image avatar: bound to data");
});

test("a file that cannot be read is an issue, never an unhandled rejection", async () => {
  const read = vi
    .spyOn(Blob.prototype, "arrayBuffer")
    .mockRejectedValue(new DOMException("the file went away", "NotReadableError"));
  try {
    const design = editor.state.design;
    await upload(
      "upload-image",
      new File([testImages.png.bytes.slice()], "pattern.png", { type: "image/png" }),
    );
    expect(editor.state.design).toBe(design);
    expect(editor.state.issues).toEqual([
      { source: "image", message: 'image "pattern.png" could not be read: the file went away' },
    ]);
    await upload("upload-font", fontFile(testFonts.ttf));
    expect(editor.state.issues).toEqual([
      {
        source: "font",
        message: 'font "Montserrat-Medium.ttf" could not be read: the file went away',
      },
    ]);
  } finally {
    read.mockRestore();
  }
});

test("the properties of a layer on an orbit edit every orbit value, undoably, and keep the rest", async () => {
  const orbit = { center: { x: 200, y: 100 }, radius: 80, radiusY: 30, angle: 30 };
  await remount({
    version: 0,
    canvas: { width: 400, height: 200 },
    layers: [{ type: "rect", width: 20, height: 10, fill: "#0969da", orbit }],
  });
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  const field = (name: string) =>
    find(`[aria-label="Properties"] [name="${name}"]`) as HTMLInputElement;
  expect(field("orbit.center.x").value).toBe("200");
  expect(field("orbit.radius").value).toBe("80");
  expect(field("orbit.radiusY").value).toBe("30");
  expect(field("orbit.angle").value).toBe("30");
  expect(root.querySelector('[name="orbit"]')).toBeNull();
  const before = await previewSvg();
  await setField("orbit.angle", "120");
  expect(editor.state.design.layers[0]).toEqual({
    type: "rect",
    width: 20,
    height: 10,
    fill: "#0969da",
    orbit: { ...orbit, angle: 120 },
  });
  expect(await previewSvg()).not.toBe(before);
  await setField("orbit.fade.from", "-1");
  expect(editor.state.issues).toHaveLength(1);
  await setField("orbit.fade.to", "1");
  expect(editor.state.design.layers[0]).toMatchObject({ orbit: { fade: { from: -1, to: 1 } } });
  editor.undo();
  editor.undo();
  await editor.settled();
  expect(editor.state.design.layers[0]).toMatchObject({ orbit });
  expect(await previewSvg()).toBe(before);
  await click('[data-action="remove-orbit"]');
  expect(Object.hasOwn(editor.state.design.layers[0] ?? {}, "orbit")).toBe(false);
  await click('[data-action="add-orbit"]');
  expect(editor.state.design.layers[0]).toMatchObject({
    orbit: { center: { x: 0, y: 0 }, radius: 0, angle: 0 },
  });
});
