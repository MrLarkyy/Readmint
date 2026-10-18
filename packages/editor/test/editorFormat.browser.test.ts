import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { Binding, Design, Palette } from "@readmint/format";
import { mountEditor, type EditorHandle } from "../src/index.js";

let root: HTMLElement;
let editor: EditorHandle;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  editor.destroy();
  root.remove();
});

async function mount(design: Design): Promise<void> {
  editor = mountEditor(root, { initial: design });
  await editor.settled();
}

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

const labelled = (label: string) => `[aria-label="${label}"]`;

async function click(selector: string): Promise<void> {
  await userEvent.click(find(selector));
  await editor.settled();
}

/** Types into the control with this aria-label and leaves it, which commits the change. */
async function fill(label: string, value: string): Promise<void> {
  await userEvent.fill(find(labelled(label)), value);
  await userEvent.tab();
  await editor.settled();
}

async function previewSvg(): Promise<string> {
  return (await fetch((find("img") as HTMLImageElement).src)).text();
}

const palette = {
  light: { bg: "#ffffff", ink: "#1f2328" },
  dark: { bg: "#0d1117", ink: "#e6edf3" },
} as const;

const paletteDesign: Design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  palette,
  layers: [{ type: "rect", width: 100, height: 40, fill: "{{ palette.bg }}" }],
};

const themed = (theme: string): Design => ({
  version: 0,
  canvas: { width: 100, height: 40 },
  palette,
  components: {
    card: {
      props: { theme: { type: "enum", values: ["light", "dark"], default: theme } },
      layers: [{ type: "rect", width: 100, height: 40, fill: "{{ palette.bg }}" }],
    },
  },
  layers: [{ type: "component", ref: "card" }],
});

const letDesign: Design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  layers: [{ type: "rect", width: "{{ w }}", height: 40, fill: "#000000", let: { w: "{{ 10 }}" } }],
};

test("a let row edit reaches the preview and one undo takes it back", async () => {
  await mount(letDesign);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  expect(await previewSvg()).toContain('width="10"');
  await fill("Let expression w", "{{ 30 }}");
  expect(await previewSvg()).toContain('width="30"');
  await click('[data-action="add-let"]');
  expect(Object.keys((editor.state.design.layers[0] as { let: object }).let)).toEqual([
    "w",
    "local1",
  ]);
  editor.undo();
  await editor.settled();
  expect(Object.keys((editor.state.design.layers[0] as { let: object }).let)).toEqual(["w"]);
});

test("an invalid let name is listed with the format's message and the design is unchanged", async () => {
  await mount(letDesign);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  const before = editor.state.design;
  await fill("Let name w", "props");
  expect(editor.state.design).toBe(before);
  expect(find(labelled("Issues")).textContent).toContain("reserved");
});

test("a palette text edit and a picker edit change the fill", async () => {
  await mount(paletteDesign);
  expect(await previewSvg()).toContain('fill="#ffffff"');
  await fill("bg in light", "#ff0000");
  expect(await previewSvg()).toContain('fill="#ff0000"');
  const picker = find(labelled("Pick bg in light")) as HTMLInputElement;
  picker.value = "#00ff00";
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await editor.settled();
  expect(await previewSvg()).toContain('fill="#00ff00"');
  expect(editor.state.design.palette?.["light"]?.["bg"]).toBe("#00ff00");
});

test("Add token adds a row to every mode", async () => {
  await mount(paletteDesign);
  await click('[data-action="add-token"]');
  for (const mode of ["light", "dark"]) {
    expect(Object.keys(editor.state.design.palette?.[mode] ?? {})).toEqual(["bg", "ink", "token1"]);
  }
  expect(root.querySelector(labelled("token1 in dark"))).not.toBeNull();
});

test("the palette mode is shown next to the Variant list: the first mode, then dark", async () => {
  await mount(themed("light"));
  const label = find('[data-role="palette-mode"]');
  expect(label.textContent).toBe("Palette mode: light");
  await userEvent.selectOptions(find('[data-action="variant"]'), "dark");
  await editor.settled();
  expect(label.textContent).toBe("Palette mode: dark");
});

test("a design without a palette shows no palette mode and can add one", async () => {
  await mount(letDesign);
  expect(find('[data-role="palette-mode"]').textContent).toBe("");
  await click('[data-action="add-palette"]');
  expect(editor.state.design.palette).toEqual({ light: {} });
  expect(find('[data-role="palette-mode"]').textContent).toBe("Palette mode: light");
});

test("the add buttons are disabled at the format's caps", async () => {
  const tokens = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [`t${String(i)}`, "#000"]),
  );
  const modes = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`m${String(i)}`, tokens]));
  await mount({ ...paletteDesign, palette: modes as unknown as Palette, layers: [] });
  expect((find('[data-action="add-mode"]') as HTMLButtonElement).disabled).toBe(true);
  expect((find('[data-action="add-token"]') as HTMLButtonElement).disabled).toBe(true);
  const bindings = Object.fromEntries(
    Array.from({ length: 64 }, (_, i) => [`n${String(i)}`, "{{ 1 }}"]),
  );
  await mount({
    ...letDesign,
    layers: [
      { type: "rect", width: 1, height: 1, fill: "#000", let: bindings as Record<string, Binding> },
    ],
  });
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  expect((find('[data-action="add-let"]') as HTMLButtonElement).disabled).toBe(true);
});

test("renaming a mode that a theme prop names lists the render issue", async () => {
  await mount(themed("dark"));
  await fill("Mode dark", "night");
  expect(Object.keys(editor.state.design.palette ?? {})).toEqual(["light", "night"]);
  expect(find('[data-role="palette-mode"]').textContent).toBe("");
  expect(find(labelled("Issues")).textContent).toContain("names no palette mode");
});
