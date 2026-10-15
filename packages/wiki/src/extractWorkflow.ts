/** The first yaml block under the "Example workflow" heading of docs/action.md, fences included. */
export function extractWorkflow(actionDoc: string): string {
  const lines = actionDoc.split("\n");
  const heading = lines.findIndex((line) => line.trim() === "## Example workflow");
  const open = lines.findIndex((line, index) => index > heading && line.trim() === "```yaml");
  const close = lines.findIndex((line, index) => index > open && line.trim() === "```");
  if (heading < 0 || open < 0 || close < 0) {
    throw new Error("docs/action.md has no yaml block under '## Example workflow'");
  }
  return lines.slice(open, close + 1).join("\n");
}
