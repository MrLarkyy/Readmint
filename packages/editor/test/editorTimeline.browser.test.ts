import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { Design } from "@readmint/format";
import {
  mountEditor,
  moveLayer,
  renderPreview,
  selectLayer,
  type EditorHandle,
} from "../src/index.js";

let root: HTMLElement;
let editor: EditorHandle | undefined;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  root.remove();
});

const design: Design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  animation: { duration: 1000 },
  layers: [{ type: "rect", width: 20, height: 10, fill: "#000000" }],
} as unknown as Design;

async function mount(initial: Design = design, select = true): Promise<EditorHandle> {
  editor?.destroy();
  editor = mountEditor(root, { initial });
  await editor.settled();
  if (select) editor.dispatch((state) => selectLayer(state, "/layers/0"));
  await editor.settled();
  return editor;
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

const named = (name: string) => `[name="${name}"]`;
const offsets = () =>
  root.querySelectorAll(`[name^="animate.opacity.keyframes."][name$=".offset"]`);

async function fill(name: string, value: string): Promise<void> {
  await userEvent.fill(find(named(name)), value);
  await userEvent.tab();
  await current().settled();
}

async function click(selector: string): Promise<void> {
  await userEvent.click(find(selector));
  await current().settled();
}

function frame(time?: number): string {
  const { state } = current();
  const result = renderPreview({
    design: state.design,
    data: state.data,
    sessionAssets: state.sessionAssets,
    ...(time === undefined ? {} : { time }),
  });
  if (!result.ok) throw new Error("the design does not render");
  return result.svg;
}

const shown = () => current().svg;

test("a track is added, edited, extended and removed through the panel, each one undo step", async () => {
  const handle = await mount();
  const designs = [handle.state.design];
  const next = () => {
    designs.push(handle.state.design);
    expect(designs.at(-1)).not.toBe(designs.at(-2));
  };
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  expect(offsets()).toHaveLength(2);
  next();
  await fill("animate.opacity.keyframes.1.value", "0.5");
  next();
  await click('[aria-label="Add keyframe to opacity"]');
  expect(offsets()).toHaveLength(3);
  next();
  await click('[aria-label="Remove opacity track"]');
  expect(root.querySelectorAll(".rm-track")).toHaveLength(0);
  next();
  for (const before of designs.slice(0, -1).reverse()) {
    handle.undo();
    await handle.settled();
    expect(handle.state.design).toBe(before);
  }
});

test("an invalid offset lists the format's issue and leaves the design unchanged", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  const before = handle.state.design;
  await fill("animate.opacity.keyframes.1.offset", "2");
  expect(handle.state.design).toBe(before);
  const message = handle.state.issues[0]?.message ?? "";
  expect(message).not.toBe("");
  expect(find(".rm-issues").textContent).toContain(message);
  await fill("animate.opacity.keyframes.1.offset", "1e400");
  expect(handle.state.design).toBe(before);
  expect(handle.state.issues).toHaveLength(1);
});

test("a bezier easing with a non-number is refused, a keyword is stored", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  await userEvent.selectOptions(find(named("animate.opacity.easing")), "ease-in");
  await handle.settled();
  const track = (handle.state.design.layers[0] as { animate?: { opacity?: { easing?: unknown } } })
    .animate?.opacity;
  expect(track?.easing).toBe("ease-in");
  await userEvent.selectOptions(find(named("animate.opacity.easing")), "cubic-bezier");
  await handle.settled();
  const before = handle.state.design;
  await fill("animate.opacity.easing.x1", "abc");
  expect(handle.state.design).toBe(before);
  expect(handle.state.issues).toHaveLength(1);
});

test("pausing shows the CLI frame, scrubbing another, playing the animated SVG again", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  await fill("animate.opacity.keyframes.0.value", "0");
  const toggle = find('[data-action="toggle-play"]');
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(shown()).toContain("@keyframes");
  expect(shown()).toBe(frame());
  await userEvent.click(toggle);
  await handle.settled();
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  const pausedAt = Number((find(named("time")) as HTMLInputElement).value);
  expect(shown()).not.toContain("@keyframes");
  expect(shown()).toBe(frame(pausedAt));
  await fill("time", "400");
  expect(shown()).toBe(frame(400));
  expect((find(named("scrub")) as HTMLInputElement).value).toBe("400");
  await fill("time", "900");
  expect(shown()).toBe(frame(900));
  expect(shown()).not.toBe(frame(400));
  await userEvent.click(toggle);
  await handle.settled();
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(shown()).toContain("@keyframes");
  expect(shown()).toBe(frame());
});

test("an edit, a canvas move and undo keep the paused time and are not undo entries of their own", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  await fill("animate.opacity.keyframes.0.value", "0");
  await click('[data-action="toggle-play"]');
  await fill("time", "400");
  const before = handle.state.design;
  handle.dispatch((state) => moveLayer(state, "/layers/0", 5, 0));
  await handle.settled();
  expect(handle.state.design).not.toBe(before);
  expect((find(named("time")) as HTMLInputElement).value).toBe("400");
  expect(shown()).toBe(frame(400));
  handle.undo();
  await handle.settled();
  expect(handle.state.design).toBe(before);
  expect(shown()).toBe(frame(400));
  handle.undo();
  await handle.settled();
  expect(handle.state.design.layers[0]).not.toHaveProperty("animate.opacity.keyframes.0.value", 0);
});

test("a shorter timeline clamps the paused time", async () => {
  const handle = await mount();
  await click('[data-action="toggle-play"]');
  await fill("time", "900");
  handle.dispatch((state) => selectLayer(state, undefined));
  await handle.settled();
  await fill("timeline.duration", "500");
  expect((find(named("time")) as HTMLInputElement).value).toBe("500");
  expect((find(named("scrub")) as HTMLInputElement).max).toBe("500");
  expect(shown()).toBe(frame(500));
});

test("focus stays in the edited keyframe field after Enter", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  const input = find(named("animate.opacity.keyframes.1.value")) as HTMLInputElement;
  await userEvent.fill(input, "0.25");
  await userEvent.keyboard("{Enter}");
  await handle.settled();
  expect(document.activeElement?.getAttribute("name")).toBe("animate.opacity.keyframes.1.value");
  expect((document.activeElement as HTMLInputElement).value).toBe("0.25");
});

test("Add after puts the focus on the new row's offset, Remove keeps it on a row", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  await click('[aria-label="Add keyframe after opacity keyframe 1"]');
  expect(offsets()).toHaveLength(3);
  expect(document.activeElement?.getAttribute("name")).toBe("animate.opacity.keyframes.1.offset");
  expect((document.activeElement as HTMLInputElement).value).toBe("0.5");
  await click('[aria-label="Remove opacity keyframe 2"]');
  expect(offsets()).toHaveLength(2);
  expect(find(".rm-animate").contains(document.activeElement)).toBe(true);
});

test("the keyframe buttons are disabled at the format's bounds", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  expect((find('[aria-label="Remove opacity keyframe 1"]') as HTMLButtonElement).disabled).toBe(
    true,
  );
  for (let count = 2; count < 32; count++) {
    await click('[aria-label="Add keyframe to opacity"]');
  }
  expect(offsets()).toHaveLength(32);
  expect((find('[aria-label="Add keyframe to opacity"]') as HTMLButtonElement).disabled).toBe(true);
  expect(
    (find('[aria-label="Add keyframe after opacity keyframe 1"]') as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("without a timeline the transport is hidden and tracks need one first", async () => {
  const bare = { ...design } as Record<string, unknown>;
  delete bare["animation"];
  const handle = await mount(bare as unknown as Design, false);
  expect(find(".rm-timeline-bar").hidden).toBe(true);
  handle.dispatch((state) => selectLayer(state, "/layers/0"));
  await handle.settled();
  expect((find(named("add-track")) as HTMLSelectElement).disabled).toBe(true);
  expect(find(".rm-animate").textContent).toContain("Add a timeline on the canvas first");
  handle.dispatch((state) => selectLayer(state, undefined));
  await handle.settled();
  await click('[data-action="add-timeline"]');
  expect(handle.state.design.animation).toEqual({ duration: 3000, loop: true });
  expect(find(".rm-timeline-bar").hidden).toBe(false);
  handle.undo();
  await handle.settled();
  expect(handle.state.design.animation).toBeUndefined();
});

test("removing the timeline while a layer animates is refused with the format's issue", async () => {
  const handle = await mount();
  await userEvent.selectOptions(find(named("add-track")), "opacity");
  await handle.settled();
  handle.dispatch((state) => selectLayer(state, undefined));
  await handle.settled();
  const before = handle.state.design;
  await click('[data-action="remove-timeline"]');
  expect(handle.state.design).toBe(before);
  expect(handle.state.issues).toHaveLength(1);
});

test("after destroy no animation frame callback of the transport runs", async () => {
  const requests: FrameRequestCallback[] = [];
  const original = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    requests.push(callback);
    return original(callback);
  };
  try {
    const handle = await mount();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(requests.length).toBeGreaterThan(0);
    handle.destroy();
    editor = undefined;
    const count = requests.length;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(requests.length).toBe(count);
  } finally {
    window.requestAnimationFrame = original;
  }
});
