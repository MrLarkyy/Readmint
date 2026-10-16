import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  exportDesign,
  mountEditor,
  type EditorHandle,
  type RasterRequest,
  type SavedDesign,
  type SavedImage,
} from "../src/index.js";
import { settingsDesign, settingsText } from "./settingsDesign.js";

let root: HTMLElement;
let editor: EditorHandle;
let images: SavedImage[];
let requests: RasterRequest[];
let settingsFiles: SavedDesign[];

/** Only a hang detector, under the hook timeout: under the full parallel suite the first real-worker render takes seconds. */
const renderWaitMs = 45_000;

beforeEach(async () => {
  root = document.createElement("div");
  document.body.append(root);
  images = [];
  requests = [];
  settingsFiles = [];
  editor = mountEditor(root, {
    initial: settingsDesign,
    renderTimeoutMs: renderWaitMs,
    saveImage: (file) => images.push(file),
    saveSettings: (file) => settingsFiles.push(file),
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

test("an unknown prop is a warning, the declared ones still show, and PNG export is refused naming it", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "broken");
  await editor.settled();
  const issues = find('[aria-label="Issues"]');
  expect(issues.textContent).toContain("warning: settings: settings /broken/missing");
  expect(issues.textContent).not.toContain("s3cret");
  expect(issues.querySelector(".rm-issue-warning")).not.toBeNull();
  expect(editor.svg).toBeDefined();
  await userEvent.click(find('[data-action="export-png"]'));
  await editor.settled();
  expect(images).toEqual([]);
  expect(requests).toEqual([]);
  expect(editor.state.issues.map((issue) => issue.source)).toEqual(["export"]);
  expect(editor.state.issues[0]?.message).toContain("missing");
});

test("typing in the settings form changes the preview and the raster request", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "header");
  await editor.settled();
  const input = find('[data-prop="color"] input') as HTMLInputElement;
  expect(input.value).toBe("#ff0000");
  await userEvent.clear(input);
  await userEvent.type(input, "#123456");
  await userEvent.tab();
  await editor.settled();
  expect(editor.svg).toContain("#123456");
  expect(editor.state.settings?.sections["header"]?.["color"]).toBe("#123456");
  await userEvent.click(find('[data-action="export-png"]'));
  expect(requests[0]?.input.design.layers[0]).toMatchObject({ props: { color: "#123456" } });
  expect((find('[data-action="undo"]') as HTMLButtonElement).disabled).toBe(true);
});

test("Unset removes the prop; a default shows prefilled and is written only when edited", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "header");
  await editor.settled();
  await userEvent.click(find('[data-prop="color"] button[aria-label="Unset color"]'));
  await editor.settled();
  expect(editor.state.settings?.sections["header"]).not.toHaveProperty("color");
  expect((find('[data-prop="color"] input') as HTMLInputElement).value).toBe("#000000");
  expect(find('[data-prop="color"]').classList).toContain("rm-default");
});

test("Export settings hands over text that re-imports to the same state", async () => {
  await upload("load-settings", "settings.json", settingsText);
  await userEvent.selectOptions(section(), "header");
  await editor.settled();
  const input = find('[data-prop="color"] input') as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, "#abcdef");
  await userEvent.tab();
  await editor.settled();
  await userEvent.click(find('[data-action="export-settings"]'));
  expect(settingsFiles).toHaveLength(1);
  expect(settingsFiles[0]?.name).toBe("settings.json");
  const exported = settingsFiles[0]?.text ?? "";
  expect(exported).toContain("#abcdef");
  const before = editor.state.settings;
  await upload("load-settings", "settings.json", exported);
  expect(editor.state.settings?.sections).toEqual(before?.sections);
  expect(editor.state.settings?.section).toBe("header");
});

test("the form is hidden without a section, and New and Import keep the loaded text for the export", async () => {
  expect((find('[data-action="export-settings"]') as HTMLButtonElement).disabled).toBe(true);
  await upload("load-settings", "settings.json", settingsText);
  expect(find(".rm-settings").hidden).toBe(true);
  await userEvent.selectOptions(section(), "other");
  await editor.settled();
  expect(find(".rm-settings").hidden).toBe(false);
  await userEvent.click(find('[data-action="new"]'));
  await editor.settled();
  expect(find(".rm-settings").hidden).toBe(true);
  await userEvent.click(find('[data-action="export-settings"]'));
  await upload("import", "header.json", exportDesign(settingsDesign));
  await userEvent.click(find('[data-action="export-settings"]'));
  expect(settingsFiles.map((file) => file.text)).toEqual([settingsText, settingsText]);
});

test("a list of 1001 items is shown read-only without inputs, and no message quotes a value", async () => {
  const list = Array.from({ length: 1001 }, () => "s3cret-value");
  const design = {
    version: 0,
    canvas: { width: 20, height: 20 },
    components: {
      c: { props: { tags: { type: "array" } }, layers: [{ type: "rect", width: 5, height: 5 }] },
    },
    layers: [{ type: "component", ref: "c" }],
  } as const;
  editor.dispatch((state) => ({ ...state, design }));
  await upload("load-settings", "settings.json", JSON.stringify({ s: { tags: list } }));
  await userEvent.selectOptions(section(), "s");
  await editor.settled();
  const field = find('[data-prop="tags"]');
  expect(field.querySelectorAll("input")).toHaveLength(0);
  expect(field.textContent).toContain("1001 items");
  expect(root.textContent).not.toContain("s3cret-value");
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
