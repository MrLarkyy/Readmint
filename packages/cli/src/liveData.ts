import type { DesignArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { ExitCode } from "./ExitCode.js";
import { githubToken } from "./githubToken.js";
import { loadLiveData } from "./loadLiveData.js";
import { partialDataWarning } from "./partialDataWarning.js";

/**
 * The `loadRenderInput` `loadData` option of `--github`: loads the GitHub data with the token from `io.env` when
 * called, so `loadRenderInput` calls it only once the design and its assets are valid (a broken design costs no
 * request and is not hidden by a token problem). Without `--github` there is no option: no environment variable is
 * read and no request made. `stop` ends the load early (the preview's signal).
 */
export function liveData(
  args: DesignArgs,
  io: CliIo,
  stop?: AbortSignal,
): { readonly loadData?: () => Promise<Record<string, unknown>> } {
  if (args.github !== true) return {};
  return {
    loadData: () => {
      const token = githubToken(io.env ?? {});
      if (token === undefined) {
        return Promise.reject(
          new CliError(ExitCode.data, "--github needs a token in GH_TOKEN or GITHUB_TOKEN"),
        );
      }
      return loadLiveData({
        token,
        ...(args.login === undefined ? {} : { login: args.login }),
        fetch: io.fetch ?? globalThis.fetch,
        onPartial: (parts) => {
          void io.stderr(`warning: ${partialDataWarning(parts)}\n`);
        },
        ...(stop === undefined ? {} : { signal: stop }),
      });
    },
  };
}
