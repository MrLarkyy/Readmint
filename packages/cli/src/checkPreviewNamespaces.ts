import { GITHUB_DATA_NAMESPACE } from "@readmint/data-github";
import type { DesignArgs } from "./CliCommand.js";
import { checkDataNamespaces } from "./checkDataNamespaces.js";
import { loadDesignFile } from "./loadDesignFile.js";
import { loadFixtureData } from "./loadFixtureData.js";
import { checkFixtureNamespaces } from "./mergeDataNamespaces.js";

/**
 * The checks `render` makes before its first request, made by `preview` before the data is loaded: a `let` name of the
 * design, and a key of the `--data` fixture, equal to a namespace of `--github`, `--data-json`, `--data-feed`,
 * `--data-wakatime` or `--data-registry` throws `CliError` (exit code 1 for a `let`, 3 for a fixture key). A design or
 * fixture that cannot be read is skipped: the first render shows that as an issue, as it does without data sources.
 */
export async function checkPreviewNamespaces(
  args: Pick<
    DesignArgs,
    | "design"
    | "root"
    | "data"
    | "github"
    | "dataJson"
    | "dataFeed"
    | "dataWakaTime"
    | "dataRegistry"
  >,
  cwd: string,
): Promise<void> {
  const file = await quietly(() =>
    loadDesignFile(args.design, {
      cwd,
      ...(args.root === undefined ? {} : { root: args.root }),
    }),
  );
  if (file !== undefined) {
    checkDataNamespaces(
      file,
      args.dataJson ?? [],
      args.dataFeed ?? [],
      args.dataWakaTime ?? [],
      args.dataRegistry ?? [],
      args.github === true,
    );
  }
  if (args.data === undefined) return;
  const data = args.data;
  const fixture = await quietly(() => loadFixtureData(data, cwd));
  if (fixture === undefined) return;
  checkFixtureNamespaces(fixture, [
    ...(args.github === true ? [GITHUB_DATA_NAMESPACE] : []),
    ...[
      ...(args.dataJson ?? []),
      ...(args.dataFeed ?? []),
      ...(args.dataWakaTime ?? []),
      ...(args.dataRegistry ?? []),
    ].map((spec) => spec.namespace),
  ]);
}

async function quietly<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}
