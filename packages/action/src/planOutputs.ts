import path from "node:path";
import { type OutputFormat, outputExtension, quoteForLog, type RenderVariant } from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import type { PlannedDesign } from "./PlannedDesign.js";
import type { PlannedFile } from "./PlannedFile.js";

const darkSuffix = ".dark";

/**
 * Pairs the listed designs with their outputs `<output-dir>/<stem>.<ext>`, one per format (`apng`
 * writes `.png`), and with the dark twin `<stem>.dark.<ext>` next to a design when `exists` finds
 * it (`<stem>.dark.<ext>` outputs). A listed twin is used once, with its light design; a twin listed
 * without it, or two designs with one output name (case-insensitively: checkouts on Windows and
 * macOS fold case), is an input error. With a `variant`, a design without a twin gets the variant
 * rendered from its own file as `dark`. Order: as listed.
 */
export async function planOutputs(
  designs: readonly string[],
  outputDir: string,
  formats: readonly OutputFormat[],
  exists: (design: string) => Promise<boolean>,
  variant?: RenderVariant,
): Promise<PlannedDesign[]> {
  const listed = designs.map(normalize);
  const listedKeys = new Set(listed.map((design) => design.toLowerCase()));
  const problems: string[] = [];
  const planned: PlannedDesign[] = [];
  const outputs = new Map<string, string>();

  const file = (design: string, name: string, as?: RenderVariant): PlannedFile => {
    const planned = {
      design,
      ...(as === undefined ? {} : { variant: as }),
      outputs: formats.map((format) => ({
        format,
        output: join(outputDir, `${name}.${outputExtension(format)}`),
      })),
    };
    for (const { output } of planned.outputs) {
      const key = output.toLowerCase();
      const other = outputs.get(key);
      if (other !== undefined && other !== design) {
        problems.push(
          `designs ${quoteForLog(other)} and ${quoteForLog(design)} both write ${quoteForLog(output)}`,
        );
      }
      outputs.set(key, design);
    }
    return planned;
  };

  const seen = new Set<string>();
  for (const design of listed) {
    const key = design.toLowerCase();
    if (seen.has(key)) {
      problems.push(`design ${quoteForLog(design)} is listed twice`);
      continue;
    }
    seen.add(key);
    const { dir, stem, ext } = split(design);
    if (stem.toLowerCase().endsWith(darkSuffix) && stem.length > darkSuffix.length) {
      const light = join(dir, `${stem.slice(0, -darkSuffix.length)}${ext}`);
      if (!listedKeys.has(light.toLowerCase())) {
        problems.push(
          `design ${quoteForLog(design)} is a dark variant, but its design ${quoteForLog(light)} is not listed`,
        );
      }
      continue;
    }
    const twin = join(dir, `${stem}${darkSuffix}${ext}`);
    const light = file(design, stem);
    if (listedKeys.has(twin.toLowerCase()) || (await exists(twin))) {
      const dark = file(twin, `${stem}${darkSuffix}`);
      planned.push({ stem, light, dark });
    } else if (variant !== undefined) {
      planned.push({ stem, light, dark: file(design, `${stem}.${variant.name}`, variant) });
    } else {
      planned.push({ stem, light });
    }
  }
  if (problems.length > 0) throw new ActionError("input", problems);
  return planned;
}

function normalize(design: string): string {
  return path.posix.normalize(design.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function split(design: string): { dir: string; stem: string; ext: string } {
  const base = path.posix.basename(design);
  const ext = path.posix.extname(base);
  return { dir: path.posix.dirname(design), stem: base.slice(0, base.length - ext.length), ext };
}

function join(dir: string, name: string): string {
  return dir === "." ? name : `${dir}/${name}`;
}
