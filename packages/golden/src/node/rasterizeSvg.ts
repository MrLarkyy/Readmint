import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/**
 * Renders an SVG to PNG bytes without system fonts, so the result does not depend on the machine. `buffers` are font
 * files in memory (resvg-js 2.6.2 reads fonts only from files: each is written once to a temporary file named by
 * its SHA-256).
 */
export function rasterizeSvg(
  svg: string,
  scale = 1,
  fonts: readonly string[] = [],
  buffers: readonly Uint8Array[] = [],
): Buffer {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  if (!/\swidth\s*=/.test(root) || !/\sheight\s*=/.test(root)) {
    throw new Error("golden SVG needs width and height on the root element");
  }
  if (fonts.length === 0 && buffers.length === 0 && /<text[\s>/]/.test(svg)) {
    throw new Error("SVG has text but the suite supplies no fonts");
  }
  for (const font of fonts) {
    if (!existsSync(font)) throw new Error(`golden font file not found: ${font}`);
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { loadSystemFonts: false, fontFiles: [...fonts, ...buffers.map(fontFile)] },
  });
  return resvg.render().asPng();
}

function fontFile(bytes: Uint8Array): string {
  const directory = join(tmpdir(), "readmint-golden-fonts");
  const path = join(directory, `${createHash("sha256").update(bytes).digest("hex")}.ttf`);
  if (!existsSync(path)) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, bytes);
  }
  return path;
}
