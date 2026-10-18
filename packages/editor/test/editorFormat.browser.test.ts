import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { Binding, Design, Palette } from "@readmint/format";
import { mountEditor, type EditorHandle } from "../src/index.js";

let root: HTMLElement;
let editor: EditorHandle | undefined;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  editor?.destroy();
  root.remove();
});

async function mount(design: Design): Promise<void> {
  editor?.destroy();
  editor = mountEditor(root, { initial: design });
  await current().settled();
}

function current(): EditorHandle {
  if (editor === undefined) throw new Error("no editor");
  return editor;
}

function find(selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

const labelled = (label: string) => `[aria-label="${label}"]`;

async function click(selector: string): Promise<void> {
  await userEvent.click(find(selector));
  await current().settled();
}

/** Types into the control with this aria-label and leaves it, which commits the change. */
async function fill(label: string, value: string): Promise<void> {
  await userEvent.fill(find(labelled(label)), value);
  await userEvent.tab();
  await current().settled();
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
  expect(Object.keys((current().state.design.layers[0] as { let: object }).let)).toEqual([
    "w",
    "local1",
  ]);
  current().undo();
  await current().settled();
  expect(Object.keys((current().state.design.layers[0] as { let: object }).let)).toEqual(["w"]);
});

test("an invalid let name is listed with the format's message and the design is unchanged", async () => {
  await mount(letDesign);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  const before = current().state.design;
  await fill("Let name w", "props");
  expect(current().state.design).toBe(before);
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
  await current().settled();
  expect(await previewSvg()).toContain('fill="#00ff00"');
  expect(current().state.design.palette?.["light"]?.["bg"]).toBe("#00ff00");
});

test("Add token adds a row to every mode", async () => {
  await mount(paletteDesign);
  await click('[data-action="add-token"]');
  for (const mode of ["light", "dark"]) {
    expect(Object.keys(current().state.design.palette?.[mode] ?? {})).toEqual([
      "bg",
      "ink",
      "token1",
    ]);
  }
  expect(root.querySelector(labelled("token1 in dark"))).not.toBeNull();
});

test("the palette mode is shown next to the Variant list: the first mode, then dark", async () => {
  await mount(themed("light"));
  const label = find('[data-role="palette-mode"]');
  expect(label.textContent).toBe("Palette mode: light");
  await userEvent.selectOptions(find('[data-action="variant"]'), "dark");
  await current().settled();
  expect(label.textContent).toBe("Palette mode: dark");
});

test("a design without a palette shows no palette mode and can add one", async () => {
  await mount(letDesign);
  expect(find('[data-role="palette-mode"]').textContent).toBe("");
  await click('[data-action="add-palette"]');
  expect(current().state.design.palette).toEqual({ light: {} });
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
  expect(Object.keys(current().state.design.palette ?? {})).toEqual(["light", "night"]);
  expect(find('[data-role="palette-mode"]').textContent).toBe("");
  expect(find(labelled("Issues")).textContent).toContain("names no palette mode");
});

test("after a commit with Tab the focus lands on the next field, in let, orbit and palette", async () => {
  await mount({
    ...letDesign,
    palette,
    layers: [
      {
        type: "rect",
        width: "{{ w }}",
        height: 40,
        fill: "#000000",
        let: { w: "{{ 10 }}" },
        orbit: { center: { x: 50, y: 20 }, radius: 10, angle: 0 },
      },
    ],
  } as unknown as Design);
  await fill("bg in light", "#abcdef");
  expect(document.activeElement).toBe(find(labelled("Pick bg in light")));
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await userEvent.fill(find('[name="orbit.angle"]'), "45");
  await userEvent.tab();
  await current().settled();
  expect(document.activeElement).toBe(find('[name="orbit.speed"]'));
  await userEvent.fill(find(labelled("Let expression w")), "{{ 12 }}");
  await userEvent.tab();
  await current().settled();
  expect(document.activeElement).toBe(find('[data-action="let-remove"]'));
});

test("a click right after typing still reaches the button", async () => {
  await mount(letDesign);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await userEvent.fill(find(labelled("Let expression w")), "{{ 12 }}");
  await userEvent.click(find('[data-action="add-let"]'));
  await current().settled();
  const bindings = (current().state.design.layers[0] as { let: Record<string, string> }).let;
  expect(bindings).toEqual({ w: "{{ 12 }}", local1: "{{ null }}" });
});

test("typing the same fade numbers again records no undo entry", async () => {
  await mount({
    ...letDesign,
    layers: [
      {
        type: "rect",
        width: 10,
        height: 40,
        fill: "#000000",
        orbit: { center: { x: 50, y: 20 }, radius: 10, angle: 0 },
      },
    ],
  } as unknown as Design);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await userEvent.fill(find('[name="orbit.fade.from"]'), "-1");
  await userEvent.fill(find('[name="orbit.fade.to"]'), "1");
  await userEvent.tab();
  await current().settled();
  const withFade = current().state.design;
  await userEvent.fill(find('[name="orbit.fade.to"]'), "1");
  await userEvent.tab();
  await current().settled();
  expect(current().state.design).toBe(withFade);
  current().undo();
  await current().settled();
  expect(JSON.stringify(current().state.design)).not.toContain("fade");
});

test("Enter twice on Add token adds two tokens: the focus stays on the button", async () => {
  await mount(paletteDesign);
  find('[data-action="add-token"]').focus();
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(document.activeElement).toBe(find('[data-action="add-token"]'));
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(Object.keys(current().state.design.palette?.["light"] ?? {})).toEqual([
    "bg",
    "ink",
    "token1",
    "token2",
  ]);
});

const orbitDesign = {
  ...letDesign,
  layers: [
    {
      type: "rect",
      width: 10,
      height: 40,
      fill: "#000000",
      orbit: { center: { x: 50, y: 20 }, radius: 10, angle: 0 },
    },
  ],
} as unknown as Design;

/** The focused control's place: its key and position, e.g. `remove-token@1`. */
function focusedKey(): string {
  const active = document.activeElement;
  if (active === null || !root.contains(active)) return "(outside the editor)";
  const kind =
    active.getAttribute("data-key") ??
    active.getAttribute("name") ??
    active.getAttribute("data-action");
  const at = active.getAttribute("data-at") ?? "";
  return at === "" ? String(kind) : `${String(kind)}@${at}`;
}

async function press(selector: string, keys: string): Promise<void> {
  find(selector).focus();
  await userEvent.keyboard(keys);
  await current().settled();
}

async function rename(label: string, value: string, key: "{Enter}" | "{Tab}"): Promise<void> {
  await userEvent.fill(find(labelled(label)), value);
  await userEvent.keyboard(key);
  await current().settled();
}

const lets = () => Object.keys((current().state.design.layers[0] as { let: object }).let);

test("Remove orbit hands the focus to Add orbit, and Add orbit to the first orbit field", async () => {
  await mount(orbitDesign);
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await press('[data-action="remove-orbit"]', "{Enter}");
  expect(current().state.design.layers[0]).not.toHaveProperty("orbit");
  expect(focusedKey()).toBe("add-orbit");
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(focusedKey()).toBe("orbit.center.x");
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(current().state.design.layers[0]).toHaveProperty("orbit");
});

/** No layer reads a token, so a token can be renamed or removed. */
const unusedPalette: Design = { ...paletteDesign, layers: [] };

test("renaming a token or a mode keeps the focus in its input, with Enter and with Tab", async () => {
  await mount(unusedPalette);
  await rename("Token bg", "paper", "{Enter}");
  expect(Object.keys(current().state.design.palette?.["light"] ?? {})).toEqual(["paper", "ink"]);
  expect(document.activeElement).toBe(find(labelled("Token paper")));
  await rename("Token ink", "text", "{Tab}");
  expect(Object.keys(current().state.design.palette?.["dark"] ?? {})).toEqual(["paper", "text"]);
  expect(document.activeElement).toBe(find(labelled("Remove token text")));
  await rename("Mode dark", "night", "{Enter}");
  expect(Object.keys(current().state.design.palette ?? {})).toEqual(["light", "night"]);
  expect(document.activeElement).toBe(find(labelled("Mode night")));
  await rename("Mode light", "day", "{Tab}");
  expect(Object.keys(current().state.design.palette ?? {})).toEqual(["day", "night"]);
  expect(document.activeElement).toBe(find(labelled("Remove mode day")));
});

test("renaming a let binding keeps the focus in its row, with Enter and with Tab", async () => {
  await mount({
    ...letDesign,
    layers: [
      { type: "rect", width: 10, height: 40, fill: "#000", let: { a: "{{ 1 }}", b: "{{ 2 }}" } },
    ],
  });
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await rename("Let name a", "first", "{Enter}");
  expect(lets()).toEqual(["first", "b"]);
  expect(document.activeElement).toBe(find(labelled("Let name first")));
  await rename("Let name b", "second", "{Tab}");
  expect(lets()).toEqual(["first", "second"]);
  expect(document.activeElement).toBe(find(labelled("Let expression second")));
});

test("Remove token hands the focus to the next token's Remove, the last one to Add token", async () => {
  await mount(unusedPalette);
  await press(labelled("Remove token bg"), "{Enter}");
  expect(Object.keys(current().state.design.palette?.["light"] ?? {})).toEqual(["ink"]);
  expect(document.activeElement).toBe(find(labelled("Remove token ink")));
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(current().state.design.palette?.["light"]).toEqual({});
  expect(focusedKey()).toBe("add-token");
});

test("Remove mode hands the focus to the next mode's Remove, the last mode to Add palette", async () => {
  await mount(unusedPalette);
  await press(labelled("Remove mode light"), "{Enter}");
  expect(document.activeElement).toBe(find(labelled("Remove mode dark")));
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(current().state.design.palette).toBeUndefined();
  expect(focusedKey()).toBe("add-palette");
});

test("Remove let hands the focus to the next row's Remove, the last row to Add binding", async () => {
  await mount({
    ...letDesign,
    layers: [
      { type: "rect", width: 10, height: 40, fill: "#000", let: { a: "{{ 1 }}", b: "{{ 2 }}" } },
    ],
  });
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await press(labelled("Remove a"), "{Enter}");
  expect(lets()).toEqual(["b"]);
  expect(document.activeElement).toBe(find(labelled("Remove b")));
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(current().state.design.layers[0]).not.toHaveProperty("let");
  expect(focusedKey()).toBe("add-let");
});

test("Move up keeps the focus on the moved row", async () => {
  await mount({
    ...letDesign,
    layers: [
      {
        type: "rect",
        width: 10,
        height: 40,
        fill: "#000",
        let: { a: "{{ 1 }}", b: "{{ 2 }}", c: "{{ 3 }}" },
      },
    ],
  });
  await click('[data-pointer="/layers/0"] [data-action="select"]');
  await press(labelled("Move c up"), "{Enter}");
  expect(lets()).toEqual(["a", "c", "b"]);
  expect(document.activeElement).toBe(find(labelled("Move c up")));
  await userEvent.keyboard("{Enter}");
  await current().settled();
  expect(lets()).toEqual(["c", "a", "b"]);
  expect(document.activeElement).toBe(find(labelled("Let name c")));
});
