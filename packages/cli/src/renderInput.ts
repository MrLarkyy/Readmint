import { type RenderOptions, type RenderResult, renderSvg } from "@readmint/renderer";
import type { RenderInput } from "./loadRenderInput.js";

/** `renderSvg` of loaded input with the renderer's default limits: the bytes the Action writes for the same input. */
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
  return renderSvg(input.file.design, options);
}
