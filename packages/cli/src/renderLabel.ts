import type { RenderVariant } from "@readmint/format";
import { quoteForLog } from "./quoteForLog.js";

/** How a render of a manifest reads in a message: `<design> (render "<name>"[, <variant> variant])`. */
export function renderLabel(design: string, name: string, variant?: RenderVariant): string {
  return `${design} (render ${quoteForLog(name)}${variant === undefined ? "" : `, ${variant.name} variant`})`;
}
