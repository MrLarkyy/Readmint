import { renderVariants } from "@readmint/format";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  effectiveDesign,
  exportDesign,
  mountEditor,
  renderPreview,
  type EditorHandle,
  type SavedImage,
} from "../src/index.js";
import { manifestRasterPins } from "./editorRasterParity.js";
import { manifestDesign, manifestText } from "./settingsDesign.js";

/** A cold raster worker fetches 3 MB of WebAssembly and compiles it: allow for a slow machine. */
const slow = 180_000;

let root: HTMLElement;
let editor: EditorHandle;
let images: SavedImage[];

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  images = [];
  editor = mountEditor(root, { saveImage: (file) => images.push(file) });
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

const renderSelect = () => find('select[data-action="render"]') as HTMLSelectElement;
const variant = () => find('select[data-action="variant"]') as HTMLSelectElement;

async function upload(action: string, name: string, text: string): Promise<void> {
  await userEvent.upload(
    find(`input[data-action="${action}"]`),
    new File([text], name, { type: "application/json" }),
  );
  await editor.settled();
}

async function chooseRender(name: string): Promise<void> {
  await userEvent.selectOptions(renderSelect(), name);
  await editor.settled();
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function previewBytes(): string {
  const { design } = effectiveDesign(editor.state);
  const result = renderPreview({
    design,
    data: editor.state.data,
    sessionAssets: editor.state.sessionAssets,
  });
  if (!result.ok) throw new Error("preview failed");
  return result.svg;
}

async function open(): Promise<void> {
  await upload("import", "card.json", exportDesign(manifestDesign));
  await upload("load-manifest", "renders.json", manifestText);
}

test("the Render list shows every render and disables those of another design file", async () => {
  await open();
  const options = [...renderSelect().options].map((option) => [option.text, option.disabled]);
  expect(options).toEqual([
    ["No render", false],
    ["card-a (card.json)", false],
    ["card-b (card.json)", false],
    ["plain (card.json)", false],
    ["themed (card.json)", false],
    ["other (sub/other.json)", true],
  ]);
  expect(renderSelect().value).toBe("");
});

test("choosing a render previews it as the CLI renders it, the section named like it, the form greyed from the render", async () => {
  await open();
  await upload("load-settings", "settings.json", JSON.stringify({ "card-a": {} }));
  const plain = editor.svg;
  await chooseRender("card-a");
  await vi.waitFor(() => {
    expect(editor.svg).not.toBe(plain);
  });
  expect(editor.state.manifest?.render).toBe("card-a");
  expect(editor.svg).toBe(previewBytes());
  expect((find('select[data-action="settings-section"]') as HTMLSelectElement).value).toBe(
    "card-a",
  );
  expect(find('[data-prop="slot"]').dataset["from"]).toBe("render");
  expect(find('[data-prop="slot"]').classList).toContain("rm-default");
  const light = editor.svg;
  await userEvent.selectOptions(variant(), "dark");
  await editor.settled();
  await vi.waitFor(() => {
    expect(editor.svg).not.toBe(light);
  });
  expect(editor.svg).toBe(previewBytes());
  expect(exportDesign(editor.state.design)).toBe(exportDesign(manifestDesign));
});

test("a render without listed variants keeps Dark; one with an empty list disables the switch with the reason", async () => {
  await open();
  await chooseRender("plain");
  expect(variant().disabled).toBe(true);
  expect(variant().title).toContain('render "plain" lists no variants');
  await chooseRender("card-a");
  expect(variant().disabled).toBe(false);
  const dark = [...variant().options].find((option) => option.value === "dark");
  expect(dark?.disabled).toBe(false);
  await chooseRender("card-b");
  await userEvent.selectOptions(variant(), "dark");
  await editor.settled();
  expect(editor.state.variant?.name).toBe("dark");
  expect(variant().disabled).toBe(false);
  expect(variant().value).toBe("dark");
});

test("importing a design file picks the first render naming it and keeps the chosen one", async () => {
  await upload("load-manifest", "renders.json", manifestText);
  await upload("import", "card.json", exportDesign(manifestDesign));
  expect(editor.state.manifest?.render).toBe("card-a");
  await chooseRender("card-b");
  await upload("import", "card.json", exportDesign(manifestDesign));
  expect(editor.state.manifest?.render).toBe("card-b");
  await userEvent.click(find('[data-action="new"]'));
  await editor.settled();
  expect(editor.state.manifest?.renders).toHaveLength(5);
  expect(editor.state.manifest?.render).toBeUndefined();
});

test(
  "the Export PNG of a chosen render is named like the CLI's file and equals its bytes",
  async () => {
    await open();
    await chooseRender("card-a");
    await userEvent.selectOptions(variant(), "dark");
    await editor.settled();
    await userEvent.click(find('[data-action="export-png"]'));
    await editor.settled();
    expect(editor.state.issues).toEqual([]);
    expect(images.map((image) => image.name)).toEqual(["card-a.dark.png"]);
    expect(await sha256(images[0]?.bytes ?? new Uint8Array())).toBe(
      manifestRasterPins["card-a.dark.png"],
    );
  },
  slow,
);

test("a manifest that does not parse is shown as an issue and keeps the list", async () => {
  await open();
  await upload("load-manifest", "renders.json", '{"renders": [{"name": "a"}]}');
  expect(find('[aria-label="Issues"]').textContent).toContain("manifest ");
  expect(editor.state.manifest?.renders).toHaveLength(5);
});

test("Export PNG of a render whose variant clashes is refused for that reason", async () => {
  await open();
  await chooseRender("themed");
  await userEvent.selectOptions(variant(), "dark");
  await editor.settled();
  await userEvent.click(find('[data-action="export-png"]'));
  await editor.settled();
  expect(images).toHaveLength(0);
  expect(find('[aria-label="Issues"]').textContent).toContain(
    'the png export needs render "themed" to apply',
  );
});

test("a manifest that is not UTF-8 is refused and the loaded one stays", async () => {
  await open();
  await userEvent.upload(
    find('input[data-action="load-manifest"]'),
    new File([new Uint8Array([0xff])], "renders.json", { type: "application/json" }),
  );
  await editor.settled();
  expect(find('[aria-label="Issues"]').textContent).toContain("manifest is not valid UTF-8");
  expect(editor.state.manifest?.renders).toHaveLength(5);
});

test("a manifest over the size cap is refused before it is read", async () => {
  await open();
  const big = new File([new Uint8Array(3 * 1_048_576 + 4)], "renders.json");
  await userEvent.upload(find('input[data-action="load-manifest"]'), big);
  await editor.settled();
  expect(find('[aria-label="Issues"]').textContent).toContain("manifest is larger than");
  expect(editor.state.manifest?.renders).toHaveLength(5);
});

test("a reload where the render lists no variants drops Dark and keeps the switch usable", async () => {
  await open();
  await chooseRender("card-b");
  await userEvent.selectOptions(variant(), "dark");
  await editor.settled();
  await upload(
    "load-manifest",
    "renders.json",
    JSON.stringify({ renders: [{ name: "card-b", design: "card.json", variants: [] }] }),
  );
  expect(editor.state.variant).toBeUndefined();
  expect(variant().value).toBe("");
});

test("Export PNG refuses a variant the chosen render does not list", async () => {
  await open();
  await chooseRender("plain");
  const dark = renderVariants[0];
  if (dark === undefined) throw new Error("no variant");
  editor.dispatch((state) => ({ ...state, variant: dark }));
  await editor.settled();
  await userEvent.click(find('[data-action="export-png"]'));
  await editor.settled();
  expect(images).toHaveLength(0);
  expect(find('[aria-label="Issues"]').textContent).toContain("does not list");
});

test(
  "Export PNG of a render needs the section the CLI uses: its name, or none when the file lacks it",
  async () => {
    await open();
    await upload("load-settings", "settings.json", JSON.stringify({ "card-a": {}, card: {} }));
    const section = find('select[data-action="settings-section"]') as HTMLSelectElement;
    await chooseRender("plain");
    expect(editor.state.settings?.section).toBeUndefined();
    await userEvent.selectOptions(section, "card");
    await editor.settled();
    await userEvent.click(find('[data-action="export-png"]'));
    await editor.settled();
    expect(images).toHaveLength(0);
    expect(find('[aria-label="Issues"]').textContent).toContain(
      "uses no settings section, as readmint render --manifest does",
    );
    await userEvent.selectOptions(section, "");
    await editor.settled();
    await userEvent.click(find('[data-action="export-png"]'));
    await editor.settled();
    expect(images.map((image) => image.name)).toEqual(["plain.png"]);
    await chooseRender("card-a");
    await userEvent.selectOptions(section, "card");
    await editor.settled();
    await userEvent.click(find('[data-action="export-png"]'));
    await editor.settled();
    expect(find('[aria-label="Issues"]').textContent).toContain('the settings section "card-a"');
    expect(images).toHaveLength(1);
  },
  slow,
);
