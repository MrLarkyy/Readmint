import { escapeForLog } from "./escapeForLog.js";

/** Writes each line escaped (`escapeForLog`) and ended by a line feed, in one write. */
export async function printLines(
  write: (text: string) => void | Promise<void>,
  lines: readonly string[],
): Promise<void> {
  if (lines.length === 0) return;
  await write(lines.map((line) => `${escapeForLog(line)}\n`).join(""));
}
