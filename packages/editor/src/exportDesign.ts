import type { Design } from "@readmint/format";

/** The design file the editor saves: JSON, two-space indent, a final line feed. Same design, same bytes. */
export function exportDesign(design: Design): string {
  return `${JSON.stringify(design, null, 2)}\n`;
}
