import { CliError, formatIssue, loadRenderInput, renderInput } from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import type { PlannedDesign } from "./PlannedDesign.js";

/** One rendered output file. */
export interface RenderedFile {
  /** Relative to the workspace, `/`-separated. */
  readonly output: string;
  readonly svg: string;
}

export interface RenderAllResult {
  readonly files: readonly RenderedFile[];
  /** Renderer warnings, one line each, not escaped yet. */
  readonly warnings: readonly string[];
}

/**
 * Loads and renders every planned design and dark twin the way `readmint render` does
 * (`loadRenderInput` inside the workspace, then `renderInput`), so the bytes are the CLI's.
 * All or nothing: when any design fails, `ActionError` (render) lists every problem and no file
 * is returned to be written.
 */
export async function renderAll(
  plan: readonly PlannedDesign[],
  workspace: string,
  data: Record<string, unknown>,
  locale: string | undefined,
): Promise<RenderAllResult> {
  const files: RenderedFile[] = [];
  const warnings: string[] = [];
  const problems: string[] = [];
  for (const entry of plan) {
    for (const planned of entry.dark === undefined ? [entry.light] : [entry.light, entry.dark]) {
      let input;
      try {
        input = await loadRenderInput({ design: planned.design }, { cwd: workspace });
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        problems.push(...error.lines);
        continue;
      }
      const name = input.file.name;
      const result = renderInput({ ...input, data }, locale === undefined ? {} : { locale });
      if (!result.ok) {
        problems.push(...result.issues.map((issue) => formatIssue(name, issue, "error")));
        continue;
      }
      warnings.push(...result.warnings.map((issue) => formatIssue(name, issue, "warning")));
      files.push({ output: planned.output, svg: result.svg });
    }
  }
  if (problems.length > 0) throw new ActionError("render", problems);
  return { files, warnings };
}
