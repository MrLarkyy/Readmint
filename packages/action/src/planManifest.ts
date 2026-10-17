import type { LoadedRenderManifest, OutputFormat, RenderVariant } from "@readmint/cli";
import { ActionError } from "./ActionError.js";
import { claimOutput } from "./claimOutput.js";
import { outputPath } from "./outputPath.js";
import type { PlannedDesign } from "./PlannedDesign.js";
import type { PlannedFile } from "./PlannedFile.js";

/**
 * Pairs the renders of a loaded manifest with their outputs `<output-dir>/<name>.<ext>`, one per format, and with
 * `<name>.dark.<ext>` for the variant the loaded render resolved (its own, else the run's). No twin file is looked up: the variant is rendered from the render's own design. Two renders with
 * one output name, ignoring letter case, are an input error. Order: as listed.
 */
export function planManifest(
  manifest: LoadedRenderManifest,
  outputDir: string,
  formats: readonly OutputFormat[],
): PlannedDesign[] {
  const problems: string[] = [];
  const claims = new Map<string, string>();
  const planned: PlannedDesign[] = [];
  for (const render of manifest.renders) {
    const file = (name: string, as?: RenderVariant): PlannedFile => {
      const outputs = formats.map((format) => ({
        format,
        output: outputPath(outputDir, name, format),
      }));
      for (const { output } of outputs)
        claimOutput(claims, problems, "renders", render.name, output);
      return {
        design: render.design,
        ...(as === undefined ? {} : { variant: as }),
        entry: {
          name: render.name,
          props: render.props,
          at: render.at,
          manifest: manifest.label,
        },
        root: manifest.folder,
        outputs,
      };
    };
    // `PlannedDesign` has one dark output; `dark` is the only variant there is.
    const [dark] = render.variants;
    planned.push({
      stem: render.name,
      light: file(render.name),
      ...(dark === undefined ? {} : { dark: file(`${render.name}.${dark.name}`, dark) }),
    });
  }
  if (problems.length > 0) throw new ActionError("input", problems);
  return planned;
}
