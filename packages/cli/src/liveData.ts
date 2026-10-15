import type { DesignArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { ExitCode } from "./ExitCode.js";
import { githubToken } from "./githubToken.js";
import { loadLiveData } from "./loadLiveData.js";

/**
 * The `loadRenderInput` data option of `--github`: the GitHub data loaded with the token from `io.env`. Without
 * `--github` it reads no environment variable and makes no request. `stop` ends the load early (the preview's signal).
 */
export async function liveData(
  args: DesignArgs,
  io: CliIo,
  stop?: AbortSignal,
): Promise<{ readonly data?: Record<string, unknown> }> {
  if (args.github !== true) return {};
  const token = githubToken(io.env ?? {});
  if (token === undefined) {
    throw new CliError(ExitCode.data, "--github needs a token in GH_TOKEN or GITHUB_TOKEN");
  }
  const data = await loadLiveData({
    token,
    ...(args.login === undefined ? {} : { login: args.login }),
    fetch: io.fetch ?? globalThis.fetch,
    ...(stop === undefined ? {} : { signal: stop }),
  });
  return { data };
}
