import { exportRaster, RasterError, type RasterOutput } from "@readmint/raster/browser";
import { renderSvg } from "@readmint/renderer";
import type { RasterExportInput } from "./RasterExportInput.js";

/**
 * The editor's raster export: what `readmint render design.json --data data.json --format png|webp` does, with
 * the session's asset bytes: `renderSvg` per frame, `exportRaster` with the CLI's defaults. Needs `initRaster` of
 * `@readmint/raster/browser` to have run, in a worker. Throws with the renderer's or the rasterizer's message.
 */
export async function renderRasterExport(input: RasterExportInput): Promise<RasterOutput> {
  const render = (time?: number) =>
    renderSvg(input.design, {
      data: input.data,
      assets: input.sessionAssets,
      ...(time === undefined ? {} : { time }),
    });
  const first = render();
  if (!first.ok) throw new Error(first.issues.map((issue) => issue.message).join("; "));
  const frame = (time?: number): string => {
    if (time === undefined) return first.svg;
    const rendered = render(time);
    if (!rendered.ok) throw new Error(rendered.issues.map((issue) => issue.message).join("; "));
    return rendered.svg;
  };
  try {
    return await exportRaster(
      {
        frame,
        ...(first.report.animation === undefined ? {} : { animation: first.report.animation }),
      },
      { format: input.format },
    );
  } catch (error) {
    if (error instanceof RasterError)
      throw new Error(`${input.format} export failed: ${error.message}`, { cause: error });
    throw error;
  }
}
