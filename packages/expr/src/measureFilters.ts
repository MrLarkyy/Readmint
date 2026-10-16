import type { ExprValue } from "./ExprValue.js";
import { budgetFailure, failure, stringInput, success, type Checked } from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import type { TextMeasurer } from "./TextMeasurer.js";
import { textSteps } from "./textSteps.js";

/** UTF-16 code units of the longest text the measuring filters take: the longest content a text layer has. */
const maxMeasuredLength = 10_000;
const maxSize = 1000;
const maxLetterSpacing = 100;

type Measured = { readonly text: string; readonly measurer: TextMeasurer };

/** The measurer and the input text, checked in the order every measuring filter reports them. */
function measuredInput(name: string, input: ExprValue, context: FilterContext): Checked<Measured> {
  const measurer = context.measurer;
  if (measurer === undefined) {
    return failure("unknown-filter", `${name} measures text as drawn and needs a renderer`);
  }
  const text = stringInput(name, input);
  if (!text.ok) return text;
  if (text.value.length > maxMeasuredLength) {
    return failure(
      "too-large",
      `${name}: the text is longer than ${String(maxMeasuredLength)} characters`,
    );
  }
  return { ok: true, value: { text: text.value, measurer } };
}

interface Typeface {
  readonly font: string;
  readonly size: number;
  readonly letterSpacing: number;
}

/** Font id, size and letter spacing from arguments `first` to `first + 2`. */
function typefaceArguments(
  name: string,
  args: readonly ExprValue[],
  first: number,
): Checked<Typeface> {
  const font = args[first] ?? null;
  if (typeof font !== "string")
    return failure("argument", `${argument(name, first)} must be a font id`);
  const size = args[first + 1] ?? null;
  if (typeof size !== "number" || !(size > 0 && size <= maxSize)) {
    return failure(
      "argument",
      `${argument(name, first + 1)} must be a font size above 0 and at most ${String(maxSize)}`,
    );
  }
  const spacing = args[first + 2] ?? 0;
  if (
    typeof spacing !== "number" ||
    !(spacing >= -maxLetterSpacing && spacing <= maxLetterSpacing)
  ) {
    return failure(
      "argument",
      `${argument(name, first + 2)} must be a letter spacing from ${String(-maxLetterSpacing)} to ${String(maxLetterSpacing)}`,
    );
  }
  return { ok: true, value: { font, size, letterSpacing: spacing } };
}

/** Measurements of a bisection over `length` code units: one per halving plus the whole text and the suffix. */
function truncateMeasurements(length: number): number {
  return 34 - Math.clz32(length);
}

function unknownFont(name: string, index: number): FilterOutcome {
  return failure("argument", `${argument(name, index)} names no font asset of the design`);
}

function argument(name: string, index: number): string {
  return `${name}: argument ${String(index + 1)}`;
}

export const measureFilters: Readonly<Record<string, FilterDefinition>> = {
  textWidth: {
    minArgs: 2,
    maxArgs: 3,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const measured = measuredInput("textWidth", input, context);
      if (!measured.ok) return measured;
      const face = typefaceArguments("textWidth", args, 0);
      if (!face.ok) return face;
      const { text, measurer } = measured.value;
      if (!context.charge(textSteps(text.length))) return budgetFailure();
      const width = measurer.width(
        text,
        face.value.font,
        face.value.size,
        face.value.letterSpacing,
      );
      return width === undefined ? unknownFont("textWidth", 0) : success(width);
    },
  },
  truncateWidth: {
    minArgs: 3,
    maxArgs: 4,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const measured = measuredInput("truncateWidth", input, context);
      if (!measured.ok) return measured;
      const width = args[0] ?? null;
      if (typeof width !== "number" || !Number.isFinite(width) || width < 0) {
        return failure("argument", "truncateWidth: argument 1 must be a width of 0 or more");
      }
      const face = typefaceArguments("truncateWidth", args, 1);
      if (!face.ok) return face;
      const { text, measurer } = measured.value;
      const steps = textSteps(text.length) * truncateMeasurements(text.length);
      if (!context.charge(steps)) return budgetFailure();
      const { font, size, letterSpacing } = face.value;
      const result = measurer.truncate(text, width, font, size, letterSpacing);
      return result === undefined ? unknownFont("truncateWidth", 1) : success(result);
    },
  },
};
