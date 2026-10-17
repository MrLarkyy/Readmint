/** `line` with the design file name that starts it replaced by `label`; any other line as it is. */
export function relabelLine(line: string, design: string, label: string): string {
  return line.startsWith(`${design}:`) ? `${label}${line.slice(design.length)}` : line;
}
