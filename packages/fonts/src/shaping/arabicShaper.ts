import { joiningTypeOf } from "../unicode/arabicJoining.js";
import type { PlanBuilder } from "./PlanBuilder.js";
import type { Shaper, ShapingState } from "./Shaper.js";

/** The joining forms, in the order the Arabic spec applies them (each in its own stage). */
const forms = ["isol", "fina", "fin2", "fin3", "medi", "med2", "init"] as const;
const isol = 0;
const fina = 1;
const medi = 4;
const init = 6;
const none = -1;

/** Joining type columns of the state machine; C (join-causing) acts as D. */
const columns: Readonly<Record<string, number>> = { U: 0, L: 1, R: 2, D: 3, C: 3 };

/**
 * HarfBuzz's Arabic joining state machine for the U, L, R and D columns: per state and column, the form the
 * previous joining character takes, the form this one takes, and the next state.
 */
const states: readonly (readonly (readonly [number, number, number])[])[] = [
  // 0: the previous character does not join.
  [
    [none, none, 0],
    [none, isol, 2],
    [none, isol, 1],
    [none, isol, 2],
  ],
  // 1: the previous character is R or an isolated form, not willing to join.
  [
    [none, none, 0],
    [none, isol, 2],
    [none, isol, 1],
    [none, isol, 2],
  ],
  // 2: the previous character is D or L in its isolated form, willing to join.
  [
    [none, none, 0],
    [none, isol, 2],
    [init, fina, 1],
    [init, fina, 3],
  ],
  // 3: the previous character is D in its final form, willing to join.
  [
    [none, none, 0],
    [none, isol, 2],
    [medi, fina, 1],
    [medi, fina, 3],
  ],
];

function collectFeatures(builder: PlanBuilder): void {
  builder.add("ccmp", { manualZwj: true });
  builder.add("locl", { manualZwj: true });
  builder.pause();
  for (const form of forms) {
    builder.add(form, { global: false });
    builder.pause();
  }
  // In Arabic a ZWJ also means "do not ligate", so the ligating features match it like any glyph.
  builder.add("rlig", { manualZwj: true });
  builder.pause();
  builder.add("rclt", { manualZwj: true });
  builder.add("calt", { manualZwj: true });
  builder.pause();
  builder.add("mset");
}

/** Gives every joining character the mask of its joining form; transparent characters (marks) are skipped. */
function setup({ buffer, plan }: ShapingState): void {
  const glyphs = buffer.glyphs;
  const actions = new Array<number>(glyphs.length).fill(none);
  let previous = -1;
  let state = 0;
  for (let index = 0; index < glyphs.length; index++) {
    const type = joiningTypeOf(glyphs[index]?.codePoint ?? 0);
    if (type === "T") continue;
    const [previousAction, action, next] = states[state]?.[columns[type] ?? 0] ?? [none, none, 0];
    if (previousAction !== none && previous >= 0) actions[previous] = previousAction;
    actions[index] = action;
    previous = index;
    state = next;
  }
  glyphs.forEach((info, index) => {
    const action = actions[index] ?? none;
    if (action !== none) info.mask |= plan.mask(forms[action] ?? "isol");
  });
}

/** The Arabic shaper (HarfBuzz hb-ot-shaper-arabic without the Syriac groups and the presentation-form fallback). */
export const arabicShaper: Shaper = {
  scriptTags: ["arab"],
  zeroMarks: "late",
  collectFeatures,
  setup,
};
