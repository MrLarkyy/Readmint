import { checkDataNamespaces, CliError, type DesignFile, loadDesignFile } from "@readmint/cli";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";
import type { PlannedDesign } from "./PlannedDesign.js";

const maxLines = 10;

/**
 * Fails with `ActionError` (data) before any request when a `let` name of a planned design equals a namespace the run
 * is going to load (`data-json`, `data-feed`, `data-wakatime`, `data-registry`, and `github` unless `data-file` is
 * given): the render would fail anyway, after the requests. A design that cannot be read is skipped; the render step
 * reports it. Names only in the lines.
 */
export async function checkActionNamespaces(
  config: ActionConfig,
  plan: readonly PlannedDesign[],
  workspace: string,
): Promise<void> {
  const github = config.dataFile === undefined;
  const json = config.dataJson ?? [];
  const feed = config.dataFeed ?? [];
  const wakaTime = config.dataWakaTime ?? [];
  const registry = config.dataRegistry ?? [];
  if (!github && json.length + feed.length + wakaTime.length + registry.length === 0) return;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const entry of plan) {
    for (const planned of entry.dark === undefined ? [entry.light] : [entry.light, entry.dark]) {
      const key = JSON.stringify([planned.design, planned.root ?? null]);
      if (seen.has(key)) continue;
      seen.add(key);
      let file: DesignFile;
      try {
        file = await loadDesignFile(planned.design, {
          cwd: workspace,
          ...(planned.root === undefined ? {} : { root: planned.root }),
        });
      } catch (error) {
        if (error instanceof CliError) continue;
        throw error;
      }
      try {
        checkDataNamespaces(file, json, feed, wakaTime, registry, github);
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        lines.push(...error.lines);
      }
    }
  }
  if (lines.length > 0)
    throw new ActionError(
      "data",
      lines.length > maxLines ? [...lines.slice(0, maxLines), "more issues not shown"] : lines,
    );
}
