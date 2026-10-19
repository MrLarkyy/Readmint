import { GITHUB_DATA_NAMESPACE } from "@readmint/data-github";
import type { DesignArgs } from "./CliCommand.js";

/** The data namespaces the sources of `args` (`--github`, `--data-json`, `--data-feed`, `--data-wakatime`, `--data-registry`) are going to load. */
export function sourceNamespaces(
  args: Pick<DesignArgs, "github" | "dataJson" | "dataFeed" | "dataWakaTime" | "dataRegistry">,
): string[] {
  return [
    ...(args.github === true ? [GITHUB_DATA_NAMESPACE] : []),
    ...[
      ...(args.dataJson ?? []),
      ...(args.dataFeed ?? []),
      ...(args.dataWakaTime ?? []),
      ...(args.dataRegistry ?? []),
    ].map((spec) => spec.namespace),
  ];
}
