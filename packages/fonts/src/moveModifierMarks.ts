import { combiningClassOf } from "./unicode/combiningClass.js";
import { isModifierCombiningMark } from "./unicode/modifierCombiningMark.js";

/**
 * UAX #53 (as HarfBuzz's `reorder_marks_arabic`) on the sorted run of non-starters `from`..`to`: the modifier
 * combining marks that begin the class 220 marks move to the start of the run, then those that begin the class 230
 * marks right after them. Only a leading group moves: an MCM behind another mark of its class keeps its place, since
 * the order of equal-class marks is meaningful (maddah then hamza stacks hamza on top). The keys move with their code
 * points. It reads the canonical class, not the keys, which may be modified classes (220 and 230 are never
 * remapped). The steps taken, linear in the run.
 */
export function moveModifierMarks(
  codePoints: number[],
  keys: number[],
  from: number,
  to: number,
): number {
  let steps = 0;
  let start = from;
  let index = from;
  for (const group of [220, 230]) {
    while (index < to && combiningClassOf(codePoints[index] ?? 0) < group) {
      index++;
      steps++;
    }
    if (index === to) break;
    if (combiningClassOf(codePoints[index] ?? 0) > group) continue;
    let end = index;
    while (end < to && isModifierOfClass(codePoints[end] ?? 0, group)) {
      end++;
      steps++;
    }
    if (end === index) continue;
    steps += rotate(codePoints, start, index, end) + rotate(keys, start, index, end);
    start += end - index;
    index = end;
  }
  return steps;
}

function isModifierOfClass(codePoint: number, group: number): boolean {
  return combiningClassOf(codePoint) === group && isModifierCombiningMark(codePoint);
}

/** Moves `values[middle..end)` in front of `values[start..middle)`, each part keeping its order; the steps taken. */
function rotate(values: number[], start: number, middle: number, end: number): number {
  const moved = values.slice(middle, end);
  values.copyWithin(start + moved.length, start, middle);
  for (let offset = 0; offset < moved.length; offset++) values[start + offset] = moved[offset] ?? 0;
  return end - start;
}
