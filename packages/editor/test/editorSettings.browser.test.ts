import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  exportDesign,
  mountEditor,
  type EditorHandle,
  type RasterRequest,
  type SavedImage,
} from "../src/index.js";
import { settingsDesign, settingsText } from "./settingsDesign.js";

let root: HTMLElement;
let editor: EditorHandle;
let images: SavedImage[];
let requests: RasterRequest[];

/** Only a hang detector, under the hook timeout: under the full parallel suite the first real-worker render takes seconds. */
const renderWaitMs = 45_000;

beforeEach(async () => {
  root = document.createElement("div");
  document.body.append(root);
  images = [];
  requests = [];
  editor = mountEditor(root, {
    initial: settingsDesign,
    renderTimeoutMs: renderWaitMs,
    saveImage: (file) => images.push(file),
    createRasterWorker: () => ({
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (message) => requests.push(message),
      terminate: () => undefined,
    }),
  });
  await editor.settled();
  await vi.waitFor(
    () => {
      expect(editor.svg).toBeDefined();
    },
    { timeout: renderWaitMs },
  );
});

afterEach(() => {
  editor.destroy();
  root.remove();
});

function section(): HTMLSelectElement {
  return find('select[data-action="settings-section"]') as HTMLSelectElement;
}

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

async function upload(action: string, name: string, text: string): Promise<void> {
  await userEvent.upload(
    find(`input[data-action="${action}"]`),
    new File([text], name, { type: "application/json" }),
  );
  await editor.settled();
}

test("a settings section changes the preview, not the design or its export", async () => {
  const before = editor.svg;
  await upload("load-settings", "settings.json", settingsText);
  const select = section();
  expect(select.disabled).toBe(false);
  expect([...select.options].map((option) => option.value)).toEqual([
    "",
    "header",
    "other",
    "broken",
  ]);
  await userEvent.selectOptions(select, "other");
  await editor.settled();
  expect(editor.svg).toContain("#00ff00");
  expect(editor.svg).not.toBe(before);
  expect(editor.state.design).toBe(settingsDesign);
  expect(exportDesign(editor.state.design)).not.toContain("#00ff00");
  await userEvent.selectOptions(select, "");
  await editor.settled();
  expect(editor.svg).toBe(before);
});

test("importing a design file picks the section named like it, and New keeps the settings", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await upload("import", "header.json", exportDesign(settingsDesign));
  expect(editor.state.settings?.section).toBe("header");
  expect(editor.svg).toContain("#ff0000");
  await userEvent.click(find('[data-action="new"]'));
  await editor.settled();
  expect(editor.state.settings?.sections).toBeDefined();
});

test("a section that does not apply is listed, the preview is the plain design and PNG export is refused", async () => {
  const plain = editor.svg;
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "broken");
  await editor.settled();
  expect(editor.svg).toBe(plain);
  expect(find('[aria-label="Issues"]').textContent).toContain("settings /broken/missing");
  expect(find('[aria-label="Issues"]').textContent).not.toContain("s3cret");
  await userEvent.click(find('[data-action="export-png"]'));
  await editor.settled();
  expect(images).toEqual([]);
  expect(editor.state.issues.map((issue) => issue.source)).toEqual(["export"]);
});

test("a settings file refused keeps the loaded one", async () => {
  await upload("load-settings", "settings.json", settingsText);
  const loaded = editor.state.settings;
  await upload("load-settings", "bad.json", "{nope");
  expect(editor.state.settings).toBe(loaded);
  expect(find('[aria-label="Issues"]').textContent).toContain("settings:");
});

test("the raster export renders the design with the section applied", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "other");
  await editor.settled();
  await userEvent.click(find('[data-action="export-png"]'));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.input.design.layers[0]).toMatchObject({ props: { color: "#00ff00" } });
  expect(editor.state.design.layers[0]).not.toHaveProperty("props");
});

test("New keeps the settings file but no section, so nothing is reported and export is allowed", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "other");
  await editor.settled();
  await userEvent.click(find('[data-action="new"]'));
  await editor.settled();
  expect(editor.state.settings?.section).toBeUndefined();
  expect(section().value).toBe("");
  expect(find('[aria-label="Issues"]').textContent).not.toContain("settings");
  await userEvent.click(find('[data-action="export-png"]'));
  expect(requests).toHaveLength(1);
});
