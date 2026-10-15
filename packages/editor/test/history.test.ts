import { describe, expect, test } from "vitest";
import {
  addLayer,
  attachAsset,
  canRedo,
  canUndo,
  checkFonts,
  createEditorState,
  createHistory,
  EditorLimits,
  type EditorHistory,
  type EditorState,
  loadFixture,
  moveLayer,
  newDesign,
  recordEdit,
  redo,
  removeLayer,
  reorderLayer,
  resizeLayer,
  selectLayer,
  setFontAsset,
  setLayerProperty,
  undo,
  uploadFont,
  uploadImage,
} from "../src/index.js";
import { testFonts } from "./testFonts.js";
import { testImages } from "./testImages.js";

type Command = (state: EditorState) => EditorState;

interface Session {
  readonly history: EditorHistory;
  readonly state: EditorState;
}

/** What the mounted editor's dispatch does: apply, then record. */
function run(session: Session, command: Command): Session {
  const state = command(session.state);
  return { history: recordEdit(session.history, session.state, state), state };
}

const base: EditorState = [
  (s: EditorState) => addLayer(s, "rect"),
  (s: EditorState) => addLayer(s, "group"),
  (s: EditorState) => uploadFont(s, testFonts.ttf),
  (s: EditorState) => selectLayer(s, "/layers/0"),
].reduce((state, command) => command(state), createEditorState(newDesign()));

const commands: readonly (readonly [string, Command])[] = [
  ["addLayer", (s) => addLayer(s, "ellipse", "/layers/1")],
  ["moveLayer", (s) => moveLayer(s, "/layers/0", 5, 7)],
  ["resizeLayer", (s) => resizeLayer(s, "/layers/0", { x: 1, y: 2, width: 30, height: 40 })],
  ["setLayerProperty", (s) => setLayerProperty(s, "/layers/0", "fill", "#000000")],
  ["reorderLayer", (s) => reorderLayer(s, "/layers/0", 1)],
  ["removeLayer", (s) => removeLayer(s, "/layers/0")],
  ["uploadFont", (s) => uploadFont(s, testFonts.otf)],
  ["setFontAsset", (s) => setFontAsset(s, "Montserrat-Medium", { embedding: "restricted" })],
  ["uploadImage", (s) => uploadImage(s, testImages.png)],
];

describe("every editing command can be undone and redone", () => {
  test.each(commands)("%s", (_name, command) => {
    const before: Session = { history: createHistory(), state: base };
    const after = run(before, command);
    expect(after.state.issues).toEqual([]);
    expect(after.state.design).not.toBe(base.design);
    expect(canUndo(after.history)).toBe(true);
    expect(canRedo(after.history)).toBe(false);

    const undone = undo(after.history, after.state);
    expect(undone).toBeDefined();
    if (undone === undefined) return;
    expect(undone.state.design).toEqual(base.design);
    expect(undone.state.selection).toBe(base.selection);
    expect(canUndo(undone.history)).toBe(false);
    expect(canRedo(undone.history)).toBe(true);

    const redone = redo(undone.history, undone.state);
    expect(redone).toBeDefined();
    if (redone === undefined) return;
    expect(redone.state.design).toBe(after.state.design);
    expect(redone.state.selection).toBe(after.state.selection);
    expect(canRedo(redone.history)).toBe(false);
  });
});

describe("only design edits are history entries", () => {
  const image = createEditorState({
    ...newDesign(),
    assets: { images: { logo: { src: "logo.png" } } },
  });
  test.each<readonly [string, EditorState, Command]>([
    ["a refused command", base, (s) => addLayer(s, "rect", "/layers/0")],
    ["a selection", base, (s) => selectLayer(s, "/layers/1")],
    ["fixture data", base, (s) => loadFixture(s, JSON.stringify({ repo: { name: "x" } }))],
    ["a font check", base, checkFonts],
    ["an attached file", image, (s) => attachAsset(s, "images", "logo", testImages.png.bytes)],
    ["a drag that rounds to no move", base, (s) => moveLayer(s, "/layers/0", 0.3, -0.2)],
    [
      "a resize to the same box",
      base,
      (s) => resizeLayer(s, "/layers/0", { x: 20, y: 20, width: 120, height: 60 }),
    ],
    ["a property set to its value", base, (s) => setLayerProperty(s, "/layers/0", "x", 20)],
  ])("%s records nothing", (_name, state, command) => {
    const history = createHistory();
    const next = run({ history, state }, command);
    expect(next.state.design).toBe(state.design);
    expect(next.history).toBe(history);
  });
});

test("undo restores the selection of its entry, keeps session inputs and clears the issues", () => {
  let session: Session = { history: createHistory(), state: base };
  session = run(session, (s) => moveLayer(s, "/layers/0", 10, 0));
  session = run(session, (s) => selectLayer(s, undefined));
  session = run(session, (s) => loadFixture(s, JSON.stringify({ repo: { name: "x" } })));
  session = run(session, (s) => addLayer(s, "rect", "/layers/0"));
  expect(session.state.issues).toHaveLength(1);
  const undone = undo(session.history, session.state);
  expect(undone?.state.selection).toBe("/layers/0");
  expect(undone?.state.data).toEqual({ repo: { name: "x" } });
  expect(undone?.state.sessionAssets).toBe(session.state.sessionAssets);
  expect(undone?.state.fontChecks).toBe(session.state.fontChecks);
  expect(undone?.state.issues).toEqual([]);
  // An entry made with nothing selected restores no selection.
  session = run({ history: createHistory(), state: selectLayer(base, undefined) }, (s) =>
    addLayer(s, "rect"),
  );
  const cleared = undo(session.history, session.state);
  expect(cleared?.state.selection).toBeUndefined();
  expect(cleared !== undefined && "selection" in cleared.state).toBe(false);
});

test("a new edit after undo drops what could be redone", () => {
  let session: Session = { history: createHistory(), state: base };
  session = run(session, (s) => moveLayer(s, "/layers/0", 1, 0));
  session = run(session, (s) => moveLayer(s, "/layers/0", 1, 0));
  const undone = undo(session.history, session.state);
  if (undone === undefined) throw new Error("nothing to undo");
  expect(canRedo(undone.history)).toBe(true);
  session = run(undone, (s) => moveLayer(s, "/layers/0", 0, 1));
  expect(canRedo(session.history)).toBe(false);
  expect(redo(session.history, session.state)).toBeUndefined();
  expect(session.history.past).toHaveLength(2);
});

test("the history is bounded: beyond maxHistory the oldest edit is dropped", () => {
  expect(EditorLimits.maxHistory).toBe(100);
  let session: Session = { history: createHistory(), state: base };
  const states: EditorState[] = [];
  for (let index = 0; index < EditorLimits.maxHistory + 5; index++) {
    states.push(session.state);
    session = run(session, (s) => moveLayer(s, "/layers/0", 1, 0));
  }
  expect(session.history.past).toHaveLength(EditorLimits.maxHistory);
  let steps = 0;
  let step = undo(session.history, session.state);
  while (step !== undefined) {
    session = step;
    steps++;
    step = undo(session.history, session.state);
  }
  expect(steps).toBe(EditorLimits.maxHistory);
  // The five oldest edits are gone: undo stops at the design after them.
  expect(session.state.design).toBe(states[5]?.design);
  expect(undo(session.history, session.state)).toBeUndefined();
});

test("recordEdit takes a smaller limit", () => {
  let history = createHistory();
  let state = base;
  for (let index = 0; index < 4; index++) {
    const next = moveLayer(state, "/layers/0", 1, 0);
    history = recordEdit(history, state, next, 2);
    state = next;
  }
  expect(history.past).toHaveLength(2);
});
