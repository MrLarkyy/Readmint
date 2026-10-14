import { existsSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

/** Renders an SVG to PNG bytes without system fonts, so the result does not depend on the machine. */
export function rasterizeSvg(svg: string, scale = 1, fonts: readonly string[] = []): Buffer {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  if (!/\swidth\s*=/.test(root) || !/\sheight\s*=/.test(root)) {
    throw new Error("golden SVG needs width and height on the root element");
  }
  if (fonts.length === 0 && /<text[\s>/]/.test(svg)) {
    throw new Error("SVG has text but the suite supplies no fonts");
  }
  for (const font of fonts) {
    if (!existsSync(font)) throw new Error(`golden font file not found: ${font}`);
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { loadSystemFonts: false, fontFiles: [...fonts] },
  });
  return resvg.render().asPng();
}
