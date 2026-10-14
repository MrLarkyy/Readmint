import { createBudget, createScope } from "@readmint/expr";
import { ValueRanges, type Design } from "@readmint/format";
import { escapeText } from "./escapeXml.js";
import { expandLayers } from "./expandLayers.js";
import { formatNumber } from "./formatNumber.js";
import { paintAttributes, resolvePaint } from "./paint.js";
import { RenderContext } from "./RenderContext.js";
import { RenderFailure } from "./RenderFailure.js";
import { renderLayer } from "./renderLayer.js";
import type { RenderNode } from "./RenderNode.js";
import type { RenderOptions } from "./RenderOptions.js";
import type { RenderReport } from "./RenderReport.js";
import type { RenderResult } from "./RenderResult.js";
import { echo, resolveNumber } from "./resolveValue.js";

/**
 * A validated v0 design plus data becomes a self-contained SVG: no scripts, no external references (fonts and
 * images inlined as data URIs), every string escaped. Pure and synchronous: the same design, data and assets give
 * the same bytes in Node and in every browser. The render stops at the first issue.
 */
export function renderSvg(design: Design, options: RenderOptions = {}): RenderResult {
  const context = new RenderContext(design, options);
  try {
    return render(context, options);
  } catch (error) {
    if (error instanceof RenderFailure) return { ok: false, issues: [error.issue] };
    throw error;
  }
}

/** Latest frame time a render takes: a day, far past any timeline (at most a minute), yet well inside doubles. */
export const maxFrameTime = 86_400_000;

function render(context: RenderContext, options: RenderOptions): RenderResult {
  const { design, writer } = context;
  const time: unknown = options.time;
  if (time !== undefined && !(typeof time === "number" && time >= 0 && time <= maxFrameTime)) {
    context.fail(
      "",
      "range",
      `time must be a number of milliseconds in [0, ${String(maxFrameTime)}], got ${echo(time)}`,
    );
  }
  // One budget for every evaluation of the render: child scopes share it and each repeated item is charged.
  const steps = Math.min(Math.floor(context.limits.maxExpressionSteps), Number.MAX_SAFE_INTEGER);
  const budget = createBudget(steps);
  const scope = createScope(options.data ?? {}, {
    budget,
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  });
  const canvas = design.canvas;
  const width = resolveNumber(
    context,
    canvas.width,
    "/canvas/width",
    ValueRanges.canvasSide,
    scope,
  );
  const height = resolveNumber(
    context,
    canvas.height,
    "/canvas/height",
    ValueRanges.canvasSide,
    scope,
  );
  const background = resolvePaint(context, canvas.background, "/canvas/background", scope);
  const nodes = expandLayers(context, design.layers, "/layers", scope);
  // A frame has no CSS; the animated SVG names its rules after all of them, so they are known before any is drawn.
  const prefix = context.time === undefined ? sealAnimations(context, nodes) : undefined;
  const root = prefix === undefined ? "" : ` class="${prefix}"`;
  const w = formatNumber(width);
  const h = formatNumber(height);
  if (background !== undefined && background.kind !== "none") {
    writer.write(
      `<rect width="${w}" height="${h}"${paintAttributes(writer, "fill", background)}/>`,
    );
  }
  for (const node of nodes) renderLayer(context, node);
  const title = design.title === undefined ? "" : `<title>${escapeText(design.title)}</title>`;
  const description =
    design.description === undefined ? "" : `<desc>${escapeText(design.description)}</desc>`;
  const { svg, bytes } = writer.finish(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${root} role="img">${title}${description}`,
  );
  const report: RenderReport = {
    bytes,
    limit: writer.limit,
    fonts: [...context.fonts.values()].map((font) => ({
      asset: font.asset,
      bytes: font.dataUri.length,
    })),
    images: [...context.imageBytes].map(([asset, total]) => ({ asset, bytes: total })),
    ...(design.animation === undefined
      ? {}
      : {
          animation: { duration: design.animation.duration, loop: design.animation.loop !== false },
        }),
  };
  return { ok: true, svg, report, warnings: [...context.warnings] };
}

/** Registers every animation in drawing order and writes their CSS; returns the document prefix, if any animates. */
function sealAnimations(context: RenderContext, nodes: readonly RenderNode[]): string | undefined {
  const visit = (list: readonly RenderNode[]) => {
    for (const node of list) {
      if (node.animation !== undefined) context.animationCss.register(node.animation);
      if (node.kind === "group") visit(node.children);
    }
  };
  visit(nodes);
  return context.animationCss.seal();
}
