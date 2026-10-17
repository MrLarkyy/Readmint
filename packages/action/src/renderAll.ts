import {
  CliError,
  type DesignProps,
  formatIssue,
  loadRenderInput,
  type OutputFormat,
  designNameIn,
  relabelLine,
  renderLabel,
  type RemoteImageOptions,
  renderOutput,
} from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import type { PlannedDesign } from "./PlannedDesign.js";
import type { PlannedFile } from "./PlannedFile.js";

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
  /** Info lines, one each: a default frame rate lowered to fit the raster limits. */
  readonly notes: readonly string[];
}

export interface RenderAllOptions {
  readonly locale?: string;
  readonly scale?: number;
  readonly frameRate?: number;
  readonly quality?: number;
  /** The settings file, loaded once: merged into every design by its section. */
  readonly props?: DesignProps;
  /** Fetches the images designs bind to data; one cache per run, so a dark twin shares the fetch. */
  readonly images?: RemoteImageOptions;
}

/**
 * Loads and renders every planned design and dark twin the way `readmint render` does
 * (`loadRenderInput` inside the workspace with the run's data and bound images, then
 * `renderOutput` for every planned format), so the bytes are the CLI's. All or nothing: when any
 * design or raster export fails, `ActionError` (render) lists every problem and no file is
 * returned to be written.
 */
export async function renderAll(
  plan: readonly PlannedDesign[],
  workspace: string,
  data: Record<string, unknown>,
  options: RenderAllOptions = {},
): Promise<RenderAllResult> {
  const { images, props, ...outputOptions } = options;
  const files: RenderedFile[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const problems: string[] = [];
  for (const entry of plan) {
    let lightLoaded = true;
    for (const planned of entry.dark === undefined ? [entry.light] : [entry.light, entry.dark]) {
      // A variant of a design that did not load only repeats the light failure.
      if (planned.variant !== undefined && !lightLoaded) continue;
      let loaded = false;
      try {
        const input = await loadRenderInput(
          { design: planned.design, ...(planned.root === undefined ? {} : { root: planned.root }) },
          {
            cwd: workspace,
            ...(planned.entry === undefined ? {} : { entry: planned.entry }),
            ...(planned.variant === undefined ? {} : { variant: planned.variant }),
            data,
            ...(props === undefined ? {} : { props }),
            ...(images === undefined ? {} : { images }),
          },
        );
        loaded = true;
        const label = labelOf(planned, input.file.name);
        const name = label ?? input.file.name;
        warnings.push(
          ...(input.warnings ?? []).map((line) =>
            label === undefined ? line : relabelLine(line, input.file.name, label),
          ),
        );
        const result = await renderOutput(
          input,
          planned.outputs.map((output) => output.format),
          outputOptions,
        );
        if (!result.ok) {
          problems.push(...result.issues.map((issue) => formatIssue(name, issue, "error")));
          continue;
        }
        warnings.push(...result.warnings.map((issue) => formatIssue(name, issue, "warning")));
        result.outputs.forEach((output, index) => {
          if (output.note !== undefined) notes.push(output.note);
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
        if (planned === entry.light && !loaded) lightLoaded = false;
        const name = designNameIn(planned.root, planned.design);
        const label = labelOf(planned, name);
        problems.push(
          ...(label === undefined
            ? error.lines
            : error.lines.map((line) => relabelLine(line, name, label))),
        );
      }
    }
  }
  if (problems.length > 0) throw new ActionError("render", problems);
  return { files, warnings, notes };
}

/**
 * How a render reads in a message so it is told apart from the others of its design: the variant after the design file
 * name, the render name of a manifest entry; `undefined` for a plain light design.
 */
function labelOf(planned: PlannedFile, name: string): string | undefined {
  const { entry, variant } = planned;
  if (entry !== undefined) {
    return renderLabel(name, entry.name, variant);
  }
  return variant === undefined ? undefined : `${name} (${variant.name} variant)`;
}
