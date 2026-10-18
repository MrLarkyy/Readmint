import { expect, test } from "vitest";
import {
  canUndo,
  createHistory,
  paletteEdits,
  recordEdit,
  redo,
  setLayerLet,
  setLayerProperty,
  setPalette,
  undo,
  type EditorHistory,
  type EditorState,
} from "../src/index.js";
import { editState, rectPointer } from "./formatEdits.js";

interface Session {
  history: EditorHistory;
  state: EditorState;
}

function run(session: Session, command: (state: EditorState) => EditorState): Session {
  const state = command(session.state);
  return { history: recordEdit(session.history, session.state, state), state };
}

const start: Session = { history: createHistory(), state: editState() };

test.each([
  ["a let edit", (s: EditorState) => setLayerLet(s, rectPointer, [["a", "{{ 5 }}"]])],
  [
    "a palette addToken",
    (s: EditorState) =>
      setPalette(s, paletteEdits.addToken(paletteEdits.paletteEntries(s.design.palette))),
  ],
  [
    "an orbit field edit",
    (s: EditorState) => setLayerProperty(s, `${rectPointer}/orbit`, "angle", 45),
  ],
  [
    "an orbit fade written whole",
    (s: EditorState) => setLayerProperty(s, `${rectPointer}/orbit`, "fade", { from: -1, to: 1 }),
  ],
])("%s is exactly one undo entry, and undo and redo step through it", (_name, command) => {
  const after = run(start, command);
  expect(after.state.issues).toEqual([]);
  expect(after.history.past).toHaveLength(1);
  const undone = undo(after.history, after.state);
  expect(undone?.state.design).toBe(start.state.design);
  expect(undone !== undefined && canUndo(undone.history)).toBe(false);
  const redone = undone === undefined ? undefined : redo(undone.history, undone.state);
  expect(redone?.state.design).toBe(after.state.design);
});

test("an edit that changes nothing, and a refused one, record nothing", () => {
  const same = run(start, (s) =>
    setLayerLet(s, rectPointer, [
      ["a", "{{ 1 }}"],
      ["b", "{{ a + 1 }}"],
    ]),
  );
  expect(same.history).toBe(start.history);
  const refused = run(start, (s) => setLayerLet(s, rectPointer, [["props", "{{ 1 }}"]]));
  expect(refused.history).toBe(start.history);
  expect(refused.state.issues).toHaveLength(1);
});
