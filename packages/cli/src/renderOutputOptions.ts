import type { RenderArgs } from "./CliCommand.js";
import type { RenderOutputOptions } from "./renderOutput.js";

/** The `renderOutput` options the `render` arguments set. */
export function renderOutputOptions(
  args: RenderArgs & { readonly locale?: string },
): RenderOutputOptions {
  return {
    ...(args.locale === undefined ? {} : { locale: args.locale }),
    ...(args.time === undefined ? {} : { time: args.time }),
    ...(args.scale === undefined ? {} : { scale: args.scale }),
    ...(args.frameRate === undefined ? {} : { frameRate: args.frameRate }),
    ...(args.quality === undefined ? {} : { quality: args.quality }),
  };
}
