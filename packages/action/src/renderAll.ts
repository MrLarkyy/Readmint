import {
  CliError,
  formatIssue,
  loadRenderInput,
  type OutputFormat,
  renderOutput,
} from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import type { PlannedDesign } from "./PlannedDesign.js";

/** One rendered output file. */
export interface RenderedFile {
  /** Relative to the workspace, `/`-separated. */
  readonly output: string;
  readonly format: OutputFormat;
  readonly bytes: Uint8Array;
  /** The design's size in CSS pixels; raster formats only (the README `<img>` width and height). */
  readonly size?: { readonly width: number; readonly height: number };
}

export interface RenderAllResult {
  readonly files: readonly RenderedFile[];
  /** Renderer warnings, one line each, not escaped yet. */
  readonly warnings: readonly string[];
}

export interface RenderAllOptions {
  readonly locale?: string;
  readonly scale?: number;
  readonly frameRate?: number;
}

/**
 * Loads and renders every planned design and dark twin the way `readmint render` does
 * (`loadRenderInput` inside the workspace, then `renderOutput` for every planned format), so the
 * bytes are the CLI's. All or nothing: when any design or raster export fails, `ActionError`
 * (render) lists every problem and no file is returned to be written.
 */
export async function renderAll(
  plan: readonly PlannedDesign[],
  workspace: string,
  data: Record<string, unknown>,
  options: RenderAllOptions = {},
): Promise<RenderAllResult> {
  const files: RenderedFile[] = [];
  const warnings: string[] = [];
  const problems: string[] = [];
  for (const entry of plan) {
    for (const planned of entry.dark === undefined ? [entry.light] : [entry.light, entry.dark]) {
      try {
        const input = await loadRenderInput({ design: planned.design }, { cwd: workspace });
        const name = input.file.name;
        const result = await renderOutput(
          { ...input, data },
          planned.outputs.map((output) => output.format),
          options,
        );
        if (!result.ok) {
          problems.push(...result.issues.map((issue) => formatIssue(name, issue, "error")));
          continue;
        }
        warnings.push(...result.warnings.map((issue) => formatIssue(name, issue, "warning")));
        result.outputs.forEach((output, index) => {
          const target = planned.outputs[index];
          if (target === undefined) return;
          files.push({
            output: target.output,
            format: output.format,
            bytes: output.bytes,
            ...(output.size === undefined ? {} : { size: output.size }),
          });
        });
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        problems.push(...error.lines);
      }
    }
  }
  if (problems.length > 0) throw new ActionError("render", problems);
  return { files, warnings };
}
