import {
  type RenderIssue,
  type RenderOptions,
  type RenderResult,
  renderSvg,
} from "@readmint/renderer";
import type { RenderInput } from "./loadRenderInput.js";

/**
 * `renderSvg` of loaded input with the renderer's default limits: the bytes the Action writes for the same input.
 * An issue about a value that came from the settings file keeps its code and path but loses its message, which would
 * quote the value.
 */
export function renderInput(
  input: RenderInput,
  args: { readonly locale?: string; readonly time?: number },
): RenderResult {
  const options: RenderOptions = {
    assets: input.assets,
    ...(input.data === undefined ? {} : { data: input.data }),
    ...(args.locale === undefined ? {} : { locale: args.locale }),
    ...(args.time === undefined ? {} : { time: args.time }),
  };
  const result = renderSvg(input.file.design, options);
  const pointers = input.settingsPointers ?? [];
  if (pointers.length === 0) return result;
  const mask = (issue: RenderIssue): RenderIssue =>
    pointers.some((pointer) => issue.path === pointer || issue.path.startsWith(`${pointer}/`))
      ? { ...issue, message: "the value set in the settings file is not valid here" }
      : issue;
  return result.ok
    ? { ...result, warnings: result.warnings.map(mask) }
    : { ...result, issues: result.issues.map(mask) };
}
