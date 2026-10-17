import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  exportDesign,
  mountEditor,
  type EditorHandle,
  type RasterRequest,
  type RasterResponse,
  type RasterWorker,
  type SavedImage,
} from "../src/index.js";
import { noDarkDesign, settingsDesign, themeDesign } from "./settingsDesign.js";

let root: HTMLElement;
let editor: EditorHandle | undefined;
let images: SavedImage[];
let requests: RasterRequest[];

/** Only a hang detector, under the hook timeout. */
const renderWaitMs = 45_000;

async function mount(initial: typeof themeDesign): Promise<void> {
  editor?.destroy();
  editor = mountEditor(root, {
    initial,
    renderTimeoutMs: renderWaitMs,
    saveImage: (file) => images.push(file),
    createRasterWorker: () => {
      const worker: RasterWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage: (message) => {
          requests.push(message);
          const format = message.input.format;
          queueMicrotask(() => {
            worker.onmessage?.({
              data: { file: { format, mimeType: `image/${format}`, bytes: new Uint8Array(1) } },
            } as MessageEvent<RasterResponse>);
          });
        },
        terminate: () => undefined,
      };
      return worker;
    },
  });
  await editor.settled();
  await vi.waitFor(
    () => {
      expect(editor?.svg).toBeDefined();
    },
    { timeout: renderWaitMs },
  );
}

function current(): EditorHandle {
  if (editor === undefined) throw new Error("no editor");
  return editor;
}

beforeEach(async () => {
  root = document.createElement("div");
  document.body.append(root);
  images = [];
  requests = [];
  await mount(themeDesign);
});

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  root.remove();
});

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

const variant = () => find('select[data-action="variant"]') as HTMLSelectElement;

async function upload(action: string, name: string, text: string): Promise<void> {
  await userEvent.upload(
    find(`input[data-action="${action}"]`),
    new File([text], name, { type: "application/json" }),
  );
  await current().settled();
}

async function choose(value: string): Promise<void> {
  await userEvent.selectOptions(variant(), value);
  await current().settled();
}

test("a design without a declared theme disables the switch with the reason", async () => {
  await mount(settingsDesign);
  expect(variant().disabled).toBe(true);
  expect(variant().title).toContain("no top-level component declares `theme`");
  expect(find(".rm-variant-reason").textContent).toContain("declares `theme`");
});

test("Dark re-renders the preview and the raster request, and is no undo step or export change", async () => {
  const before = current().svg;
  const exported = exportDesign(current().state.design);
  expect(variant().disabled).toBe(false);
  await choose("dark");
  await vi.waitFor(() => {
    expect(current().svg).not.toBe(before);
  });
  expect(current().svg).toContain("#000000");
  expect(current().state.design).toBe(themeDesign);
  expect(exportDesign(current().state.design)).toBe(exported);
  expect(find('[data-action="undo"]')).toHaveProperty("disabled", true);
  await userEvent.click(find('[data-action="export-png"]'));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.input.design.layers[0]).toMatchObject({ props: { theme: "dark" } });
  await choose("");
  await vi.waitFor(() => {
    expect(current().svg).toBe(before);
  });
});

test("the dark raster export asks for the dark design and is saved as design.dark.<ext>", async () => {
  await choose("dark");
  for (const format of ["png", "webp"] as const) {
    await userEvent.click(find(`[data-action="export-${format}"]`));
    await current().settled();
  }
  expect(requests.map((request) => request.input.format)).toEqual(["png", "webp"]);
  for (const request of requests) {
    expect(request.input.design.layers[0]).toMatchObject({ props: { theme: "dark" } });
  }
  expect(images.map((image) => image.name)).toEqual(["design.dark.png", "design.dark.webp"]);
  await choose("");
  await userEvent.click(find('[data-action="export-png"]'));
  await current().settled();
  expect(images.at(-1)?.name).toBe("design.png");
});

test("Import keeps the variant when the design declares theme, drops it otherwise; New clears it", async () => {
  await choose("dark");
  await upload("import", "card.dark.json", exportDesign(themeDesign));
  expect(current().state.variant?.name).toBe("dark");
  expect(variant().value).toBe("dark");
  await upload("import", "other.json", exportDesign(settingsDesign));
  expect(current().state.variant).toBeUndefined();
  expect(variant().value).toBe("");
  expect(variant().disabled).toBe(true);
  await upload("import", "card.json", exportDesign(themeDesign));
  await choose("dark");
  await userEvent.click(find('[data-action="new"]'));
  await current().settled();
  expect(current().state.variant).toBeUndefined();
});

test("a dark twin's settings section is still picked while the dark variant is kept", async () => {
  await upload(
    "load-settings",
    "settings.json",
    JSON.stringify({ card: { w: 3 }, other: { w: 9 } }),
  );
  await choose("dark");
  await upload("import", "card.dark.json", exportDesign(themeDesign));
  expect(current().state.variant?.name).toBe("dark");
  expect(current().state.settings?.section).toBe("card");
});

test("a variant that does not fit shows an issue and refuses the raster export", async () => {
  await mount(noDarkDesign);
  await choose("dark");
  expect(find('[aria-label="Issues"]').textContent).toContain("variant /theme");
  await userEvent.click(find('[data-action="export-png"]'));
  expect(requests).toHaveLength(0);
  expect(find('[aria-label="Issues"]').textContent).toContain("needs the dark variant to apply");
  expect(images).toHaveLength(0);
});
