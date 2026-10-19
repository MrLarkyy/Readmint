import path from "node:path";
import type { DesignArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { ExitCode } from "./ExitCode.js";
import { githubToken } from "./githubToken.js";
import { loadFeedArgs } from "./loadFeedArgs.js";
import { loadJsonArgs } from "./loadJsonArgs.js";
import { loadLiveData } from "./loadLiveData.js";
import { loadRegistryArgs } from "./loadRegistryArgs.js";
import { loadWakaTimeArgs } from "./loadWakaTimeArgs.js";
import { partialDataWarning } from "./partialDataWarning.js";
import { registryMissingWarning } from "./registryMissingWarning.js";
import { wakaTimePartialWarning } from "./wakaTimePartialWarning.js";

/**
 * The `loadRenderInput` `loadData` option of `--github`, `--data-json`, `--data-feed`, `--data-wakatime` and `--data-registry`: loads the
 * GitHub data with the token from `io.env`, then each JSON source, then each feed, then each WakaTime source and then each registry source (no key; entries a registry does not know are one `warning:` line) with the
 * key of its variable in `io.env` (a still-calculating answer is one `warning:` line), when called, so `loadRenderInput` calls it only once
 * the design and its assets are valid (a broken design costs no request and is not hidden by a token problem).
 * Without any of them there is no option: no environment variable is read and no request made. Their namespaces
 * never clash (`parseCliArgs` refuses that). `stop` ends the load early (the preview's signal).
 */
export function liveData(
  args: Partial<DesignArgs>,
  io: CliIo,
  stop?: AbortSignal,
): { readonly loadData?: () => Promise<Record<string, unknown>> } {
  const dataJson = args.dataJson ?? [];
  const dataFeed = args.dataFeed ?? [];
  const dataWakaTime = args.dataWakaTime ?? [];
  const dataRegistry = args.dataRegistry ?? [];
  if (
    args.github !== true &&
    dataJson.length === 0 &&
    dataFeed.length === 0 &&
    dataWakaTime.length === 0 &&
    dataRegistry.length === 0
  ) {
    return {};
  }
  const signal = stop === undefined ? {} : { signal: stop };
  return {
    loadData: async () => {
      const github = args.github === true ? await loadGitHub(args, io, stop) : {};
      const json =
        dataJson.length === 0
          ? {}
          : await loadJsonArgs(dataJson, {
              root: path.resolve(io.cwd, args.root ?? "."),
              fetch: io.fetch ?? globalThis.fetch,
              env: io.env ?? {},
              ...signal,
            });
      const feed =
        dataFeed.length === 0
          ? {}
          : await loadFeedArgs(dataFeed, { fetch: io.fetch ?? globalThis.fetch, ...signal });
      const wakaTime =
        dataWakaTime.length === 0
          ? {}
          : await loadWakaTimeArgs(dataWakaTime, {
              fetch: io.fetch ?? globalThis.fetch,
              env: io.env ?? {},
              ...(args.cacheDir === undefined
                ? {}
                : { cacheDir: path.resolve(io.cwd, args.cacheDir) }),
              onPartial: (namespace) => {
                void io.stderr(`warning: ${wakaTimePartialWarning(namespace)}\n`);
              },
              ...signal,
            });
      const registry =
        dataRegistry.length === 0
          ? {}
          : await loadRegistryArgs(dataRegistry, {
              fetch: io.fetch ?? globalThis.fetch,
              ...(args.cacheDir === undefined
                ? {}
                : { cacheDir: path.resolve(io.cwd, args.cacheDir) }),
              onMissing: (namespace, missing) => {
                void io.stderr(`warning: ${registryMissingWarning(namespace, missing)}\n`);
              },
              ...signal,
            });
      return { ...github, ...json, ...feed, ...wakaTime, ...registry };
    },
  };
}

function loadGitHub(
  args: Partial<DesignArgs>,
  io: CliIo,
  stop: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const token = githubToken(io.env ?? {});
  if (token === undefined) {
    return Promise.reject(
      new CliError(ExitCode.data, "--github needs a token in GH_TOKEN or GITHUB_TOKEN"),
    );
  }
  return loadLiveData({
    token,
    ...(args.login === undefined ? {} : { login: args.login }),
    ...(args.excludeRepositories === undefined
      ? {}
      : { excludeRepositories: args.excludeRepositories }),
    ...(args.languageCommitCap === undefined ? {} : { languageCommitCap: args.languageCommitCap }),
    ...(args.cacheDir === undefined ? {} : { cacheDir: path.resolve(io.cwd, args.cacheDir) }),
    fetch: io.fetch ?? globalThis.fetch,
    onPartial: (parts) => {
      void io.stderr(`warning: ${partialDataWarning(parts)}\n`);
    },
    ...(stop === undefined ? {} : { signal: stop }),
  });
}
