import { expect, test } from "vitest";
import {
  createEditorState,
  createHistory,
  recordEdit,
  redo,
  setVariant,
  undo,
} from "../src/index.js";
import { settingsDesign, themeDesign } from "./settingsDesign.js";

const base = createEditorState(themeDesign);

test("sets and clears the dark variant without touching the design", () => {
  const dark = setVariant(base, "dark");
  expect(dark.issues).toEqual([]);
  expect(dark.variant).toMatchObject({ name: "dark", props: { theme: "dark" } });
  expect(dark.design).toBe(base.design);
  const light = setVariant(dark, undefined);
  expect(light.variant).toBeUndefined();
  expect("variant" in light).toBe(false);
  expect(light.design).toBe(base.design);
});

test("an unknown name is refused and a long one is capped in the message", () => {
  const unknown = setVariant(base, "x".repeat(5000));
  expect(unknown.variant).toBeUndefined();
  expect(unknown.issues[0]).toMatchObject({ source: "variant" });
  expect(unknown.issues[0]?.message).toBe(`unknown variant "${"x".repeat(64)}"`);
  expect(setVariant(base, "__proto__").variant).toBeUndefined();
  expect(setVariant(base, "constructor").issues).toHaveLength(1);
});

test("a design that declares no theme refuses the variant with the reason", () => {
  const refused = setVariant(createEditorState(settingsDesign), "dark");
  expect(refused.variant).toBeUndefined();
  expect(refused.issues).toEqual([
    { source: "variant", message: "no top-level component declares `theme`" },
  ]);
});

test("the switch is no history entry and undo and redo keep the variant", () => {
  const dark = setVariant(base, "dark");
  expect(recordEdit(createHistory(), base, dark)).toEqual(createHistory());
  const edited = { ...dark, design: { ...dark.design, canvas: { width: 50, height: 50 } } };
  const history = recordEdit(createHistory(), dark, edited);
  const back = undo(history, edited);
  expect(back?.state.variant).toBe(dark.variant);
  const forth = back === undefined ? undefined : redo(back.history, back.state);
  expect(forth?.state.variant).toBe(dark.variant);
});
