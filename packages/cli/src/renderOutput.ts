import { exportRaster, RasterError } from "@readmint/raster";
import type { RenderIssue } from "@readmint/renderer";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import type { RenderInput } from "./loadRenderInput.js";
import type { OutputFormat } from "./OutputFormat.js";
import { renderInput } from "./renderInput.js";

/** One written format of a render. */
export interface RenderedOutput {
  readonly format: OutputFormat;
  /** The SVG as UTF-8, or the raster image. */
  readonly bytes: Uint8Array;
  /** The design's size in CSS pixels, for an `<img>`; raster formats only. */
  readonly size?: { readonly width: number; readonly height: number };
}

export type RenderOutputResult =
  | {
      readonly ok: true;
      /** One per requested format, in the order requested. */
      readonly outputs: readonly RenderedOutput[];
      readonly warnings: readonly RenderIssue[];
    }
  | { readonly ok: false; readonly issues: readonly RenderIssue[] };

export interface RenderOutputOptions {
  readonly locale?: string;
  readonly time?: number;
  readonly scale?: number;
  readonly frameRate?: number;
}

/**
 * `renderInput` once, then each format: the SVG exactly as rendered, or `exportRaster` of it, every frame of an
 * animation rendered again with its `time`. Fonts come from the SVG only, so a font the renderer refused to embed
 * is never drawn. A raster export that fails throws `CliError` (exit code 1) naming the design, the format and the
 * limit; nothing is returned before every format is done, so a caller has nothing partial to write.
 */
export async function renderOutput(
  input: RenderInput,
  formats: readonly OutputFormat[],
  options: RenderOutputOptions = {},
): Promise<RenderOutputResult> {
  const args = {
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  };
  const result = renderInput(input, {
    ...args,
    ...(options.time === undefined ? {} : { time: options.time }),
  });
  if (!result.ok) return result;
  const name = input.file.name;
  const frame = (time?: number): string => {
    if (time === options.time) return result.svg;
    const rendered = renderInput(input, { ...args, ...(time === undefined ? {} : { time }) });
    if (!rendered.ok) {
      throw new CliError(
        ExitCode.invalid,
        rendered.issues.map((issue) => formatIssue(name, issue, "error")),
      );
    }
    return rendered.svg;
  };
  const outputs: RenderedOutput[] = [];
  for (const format of formats) {
    if (format === "svg") {
      outputs.push({ format, bytes: new TextEncoder().encode(result.svg) });
      continue;
    }
    try {
      const raster = await exportRaster(
        {
          frame,
          ...(result.report.animation === undefined ? {} : { animation: result.report.animation }),
        },
        {
          format,
          ...(options.scale === undefined ? {} : { scale: options.scale }),
          ...(options.frameRate === undefined ? {} : { frameRate: options.frameRate }),
          ...(options.time === undefined ? {} : { time: options.time }),
        },
      );
      outputs.push({
        format,
        bytes: raster.bytes,
        size: { width: raster.displayWidth, height: raster.displayHeight },
      });
    } catch (error) {
      if (!(error instanceof RasterError)) throw error;
      throw new CliError(ExitCode.invalid, `${name}: ${format} export failed: ${error.message}`, {
        cause: error,
      });
    }
  }
  return { ok: true, outputs, warnings: result.warnings };
}
