import { expect, test } from "vitest";
import {
  canUndo,
  createHistory,
  paletteEdits,
  recordEdit,
  redo,
  setLayerLet,
  setLayerProperty,
  setLayerTrack,
  setPalette,
  setTimeline,
  undo,
  type EditorHistory,
  type EditorState,
} from "../src/index.js";
import { getAt } from "../src/designPointer.js";
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
  [
    "a track added",
    (s: EditorState) =>
      setLayerTrack(s, rectPointer, "opacity", {
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 1, value: 1 },
        ],
      }),
  ],
  [
    "a track edited",
    (s: EditorState) =>
      setLayerTrack(s, rectPointer, "x", {
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 0.5, value: 3 },
          { offset: 1, value: 1 },
        ],
        cycles: 3,
      }),
  ],
  ["a track removed", (s: EditorState) => setLayerTrack(s, rectPointer, "x", undefined)],
  ["a timeline duration", (s: EditorState) => setTimeline(s, { duration: 2000, loop: false })],
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

test("a track edit that sets the same values, or a timeline the same, records nothing", () => {
  const x = structuredClone(
    (getAt(start.state.design, rectPointer) as { animate: { x: unknown } }).animate.x,
  );
  expect(run(start, (s) => setLayerTrack(s, rectPointer, "x", x)).history).toBe(start.history);
  expect(run(start, (s) => setTimeline(s, { duration: 1000 })).history).toBe(start.history);
});

test("editing a track keeps the other tracks, orbit and let identical", () => {
  const added = run(start, (s) =>
    setLayerTrack(s, rectPointer, "opacity", {
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 1 },
      ],
    }),
  );
  const edited = run(added, (s) =>
    setLayerTrack(s, rectPointer, "opacity", {
      keyframes: [
        { offset: 0, value: 1 },
        { offset: 1, value: 0 },
      ],
    }),
  );
  const before = getAt(start.state.design, rectPointer) as Record<string, unknown>;
  const after = getAt(edited.state.design, rectPointer) as {
    animate: Record<string, unknown>;
  } & Record<string, unknown>;
  expect(after["orbit"]).toBe(before["orbit"]);
  expect(after["let"]).toBe(before["let"]);
  expect(after.animate["x"]).toBe((before["animate"] as Record<string, unknown>)["x"]);
  expect(edited.history.past).toHaveLength(2);
});
