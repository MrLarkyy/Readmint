import {
  type RenderIssue,
  type RenderOptions,
  type RenderResult,
  renderSvg,
} from "@readmint/renderer";
import type { RenderInput } from "./loadRenderInput.js";

/**
 * `renderSvg` of loaded input with the renderer's default limits: the bytes the Action writes for the same input.
 * With settings applied, every issue passes `SettingsMask`: one that could show a settings value keeps its code and
 * path but not its message.
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
  const settings = input.settingsMask;
  if (settings === undefined) return result;
  const mask = (issue: RenderIssue): RenderIssue => settings.mask(issue);
  return result.ok
    ? { ...result, warnings: result.warnings.map(mask) }
    : { ...result, issues: result.issues.map(mask) };
}
