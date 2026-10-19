import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Binding, Design, Palette } from "@readmint/format";
import { mountEditor, selectLayer, type EditorHandle } from "../src/index.js";
import "../src/editor.css";

let root: HTMLElement;
let editor: EditorHandle | undefined;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(async () => {
  editor?.destroy();
  editor = undefined;
  root.remove();
  await page.viewport(414, 896);
});

const tokens = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => [`a-long-token-name-${String(i)}`, "#112233aa"]),
);
const modes = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [`a-rather-long-mode-name-${String(i)}`, tokens]),
);
const longExpression = `{{ ${"1 + ".repeat(150)}1 }}`;

const design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  palette: modes,
  layers: [
    {
      type: "rect",
      width: 20,
      height: 10,
      fill: "#000000",
      let: { first: longExpression, second: "{{ first }}" } as Record<string, Binding>,
      orbit: { center: { x: 50, y: 20 }, radius: 10, angle: 0 },
    },
  ],
} as unknown as Design & { palette: Palette };

const widths = [1280, 375] as const;

for (const width of widths) {
  test(`at ${String(width)} px the page does not scroll sideways and every palette colour input and picker is visible`, async () => {
    await page.viewport(width, 800);
    editor = mountEditor(root, { initial: design });
    await editor.settled();
    const overflow = () => document.documentElement.scrollWidth - window.innerWidth;
    expect(overflow()).toBeLessThanOrEqual(0);
    const panel = root.querySelector<HTMLElement>(".rm-properties");
    const limit = Math.min(panel?.getBoundingClientRect().right ?? Infinity, window.innerWidth);
    const pickers = [...root.querySelectorAll<HTMLElement>(".rm-picker")];
    expect(pickers).toHaveLength(48);
    for (const picker of pickers) {
      const box = picker.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.right).toBeLessThanOrEqual(limit + 1);
    }
    for (const input of root.querySelectorAll<HTMLElement>('.rm-palette [name="colour"]')) {
      expect(input.getBoundingClientRect().width).toBeGreaterThan(40);
    }
    const unclipped = (shown: HTMLElement) => {
      expect(shown.scrollWidth).toBeLessThanOrEqual(shown.clientWidth + 1);
      expect(shown.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    };
    const modeLabel = root.querySelector<HTMLElement>('[data-role="palette-mode"]');
    if (modeLabel === null) throw new Error("no palette mode label");
    expect(modeLabel.textContent).toBe("Palette mode: a-rather-long-mode-name-0");
    unclipped(modeLabel);
    const firstToken = root.querySelector<HTMLElement>(".rm-palette-token");
    const rowLabels = [
      ...(firstToken?.querySelectorAll<HTMLElement>(".rm-palette-cell-mode") ?? []),
    ];
    expect(rowLabels.map((label) => label.textContent)).toEqual(Object.keys(modes));
    for (const label of rowLabels) {
      expect(label.title).toBe(label.textContent);
      unclipped(label);
    }
    const select = root.querySelector<HTMLElement>(
      '[data-pointer="/layers/0"] [data-action="select"]',
    );
    if (select === null) throw new Error("no select button");
    await userEvent.click(select);
    await editor.settled();
    expect(overflow()).toBeLessThanOrEqual(0);
    const remove = root.querySelector<HTMLElement>('[data-action="let-remove"]');
    const right = remove?.getBoundingClientRect().right ?? Infinity;
    expect(right).toBeLessThanOrEqual(window.innerWidth);
  });
}

const animated = {
  version: 0,
  canvas: { width: 100, height: 40 },
  animation: { duration: 3000 },
  layers: [
    {
      type: "rect",
      width: 20,
      height: 10,
      fill: "#000000",
      animate: {
        opacity: {
          keyframes: [
            { offset: 0, value: 0 },
            { offset: 0.5, value: 1, easing: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
            { offset: 1, value: 0.4 },
          ],
          easing: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
          duration: "{{ a-rather-long-binding-name-for-the-duration + 1 }}",
          cycles: 2,
        },
        fill: {
          keyframes: [
            { offset: 0, value: "#112233" },
            { offset: 1, value: "{{ a-rather-long-binding-name-for-a-colour }}" },
          ],
        },
      },
    },
  ],
} as unknown as Design;

for (const width of widths) {
  test(`at ${String(width)} px the timeline bar and the keyframe table do not scroll the page sideways`, async () => {
    await page.viewport(width, 800);
    editor = mountEditor(root, { initial: animated });
    await editor.settled();
    editor.dispatch((state) => selectLayer(state, "/layers/0"));
    await editor.settled();
    const bar = root.querySelector<HTMLElement>(".rm-timeline-bar");
    expect(bar?.hidden).toBe(false);
    expect(document.documentElement.scrollWidth - window.innerWidth).toBeLessThanOrEqual(0);
    const edge = Math.min(
      root.querySelector<HTMLElement>(".rm-properties")?.getBoundingClientRect().right ?? Infinity,
      window.innerWidth,
    );
    for (const control of root.querySelectorAll<HTMLElement>(
      ".rm-animate input, .rm-animate button",
    )) {
      const box = control.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.right).toBeLessThanOrEqual(edge + 1);
    }
    const barBox = bar?.getBoundingClientRect();
    expect(barBox?.right ?? Infinity).toBeLessThanOrEqual(window.innerWidth);
    for (const control of bar?.querySelectorAll<HTMLElement>("input, button") ?? []) {
      expect(control.getBoundingClientRect().width).toBeGreaterThan(0);
    }
  });
}
