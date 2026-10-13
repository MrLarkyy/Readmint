import { Resvg } from "@resvg/resvg-js";

/** Renders an SVG to PNG bytes without system fonts, so the result does not depend on the machine. */
export function rasterizeSvg(svg: string, scale = 1): Buffer {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  if (!/\swidth\s*=/.test(root) || !/\sheight\s*=/.test(root)) {
    throw new Error("golden SVG needs width and height on the root element");
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
