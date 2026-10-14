import { quoteInput } from "@readmint/format";
import { isLogUnsafe } from "./isLogUnsafe.js";

const options = { maxEcho: 200, escape: isLogUnsafe } as const;

/** A value from a design, a path or an argument as the CLI quotes it: at most 200 code points, JSON-quoted, escaped. */
export function quoteForLog(value: string): string {
  return quoteInput(value, options);
}
