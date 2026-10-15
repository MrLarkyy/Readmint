import { ValueRanges } from "@readmint/format";

/** A position the format accepts, as a whole number. */
export function wholePosition(value: number): number {
  const { minimum = -100_000, maximum } = ValueRanges.position;
  return clean(Math.min(maximum, Math.max(minimum, Math.round(value))));
}

/** A size the format accepts (above 0), as a whole number: at least 1. */
export function wholeSize(value: number): number {
  return clean(Math.min(ValueRanges.size.maximum, Math.max(1, Math.round(value))));
}

function clean(value: number): number {
  return value === 0 ? 0 : value;
}
