import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  CliError,
  type DesignProps,
  type LoadedRenderManifest,
  loadDesignProps,
  loadRenderManifest,
  partialDataWarning,
  propsSection,
  quoteForLog,
  type RenderVariant,
} from "@readmint/cli";
import type { ActionConfig } from "./ActionConfig.js";
import type { ActionDeps } from "./ActionDeps.js";
import { ActionError } from "./ActionError.js";
import { ActionLog } from "./ActionLog.js";
import { errnoCode } from "./errnoCode.js";
import { gitEnv } from "./gitEnv.js";
import { GitRepo } from "./GitRepo.js";
import { loadActionData } from "./loadActionData.js";
import { pictureSnippet } from "./pictureSnippet.js";
import type { PlannedDesign } from "./PlannedDesign.js";
import { planManifest } from "./planManifest.js";
import { planOutputs } from "./planOutputs.js";
import { resolveCacheDir } from "./resolveCacheDir.js";
import { readInputs } from "./readInputs.js";
import { renderAll } from "./renderAll.js";
import { type ActionOutputValues, writeActionOutputs } from "./writeActionOutputs.js";
import { writeOutputs } from "./writeOutputs.js";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * One run of the Action: inputs, outputs plan, git checks, data, render (all or nothing), write
 * the changed files, the README snippet, then, unless it is a dry run, stage the outputs and
 * commit and push them when any differs from HEAD; last the step outputs. Resolves to the exit
 * code and never throws: a known failure prints its `::error::` lines, anything else only
 * `internal error (<name>)`, since a message or stack could hold data.
 */
export async function runAction(env: Env, deps: ActionDeps): Promise<number> {
  const secrets = [env.INPUT_TOKEN ?? "", env.INPUT_TOKEN?.trim() ?? ""];
  const log = new ActionLog(deps.write, secrets);
  try {
    const config = readInputs(env);
    // Before any load: a header value must be masked before anything could print it.
    for (const name of new Set(config.dataJson?.flatMap((spec) => Object.values(spec.headers)))) {
      const value = Object.hasOwn(env, name) ? env[name] : undefined;
      if (value !== undefined) log.mask(value);
    }
    const workspace = path.resolve(deps.cwd, nonEmpty(env.GITHUB_WORKSPACE) ?? ".");
    const cacheDir = resolveCacheDir(config, workspace);
    const plan =
      config.manifest === undefined
        ? await planOutputs(
            config.designs,
            config.outputDir,
            config.formats,
            (design) => entryExists(path.resolve(workspace, design)),
            config.variant,
          )
        : planManifest(
            await loadActionManifest(config.manifest, workspace, config.variant),
            config.outputDir,
            config.formats,
          );
    if (config.manifest === undefined && config.variant !== undefined) {
      for (const entry of plan) {
        if (entry.dark !== undefined && entry.dark.variant === undefined) {
          log.info(
            `${quoteForLog(entry.dark.design)} next to ${quoteForLog(entry.light.design)} wins over the ${config.variant.name} variant`,
          );
        }
      }
    }

    const props = await loadActionProps(config, workspace);
    if (props !== undefined) warnUnusedSections(props, plan, log);

    let push: { repo: GitRepo; branch: string } | undefined;
    if (!config.dryRun) {
      const repo = new GitRepo(deps.runGit, workspace, gitEnv(env, secrets));
      const branch = config.branch ?? (await repo.currentBranch());
      if (branch === undefined) {
        throw new ActionError("git", "HEAD is detached; check out the branch the Action pushes to");
      }
      await repo.checkBranchName(branch);
      await checkPushTarget(repo, branch);
      push = { repo, branch };
    }

    const data = await loadActionData(
      config,
      workspace,
      deps.fetch,
      (parts) => {
        log.warning(partialDataWarning(parts));
      },
      env,
      cacheDir,
    );
    if (config.formats.some((format) => format !== "svg")) await loadRaster(deps);
    const rendered = await renderAll(plan, workspace, data, {
      ...(config.locale === undefined ? {} : { locale: config.locale }),
      scale: config.scale,
      ...(props === undefined ? {} : { props }),
      ...(config.frameRate === undefined ? {} : { frameRate: config.frameRate }),
      ...(config.quality === undefined ? {} : { quality: config.quality }),
      // Its own request init, never the GitHub loader's: the token goes to api.github.com only.
      images: { fetch: deps.fetch ?? globalThis.fetch, cache: new Map() },
    });
    for (const warning of rendered.warnings) log.warning(warning);
    for (const note of rendered.notes) log.info(note);
    const written = await writeOutputs(workspace, config.outputDir, rendered.files);
    log.info(
      `rendered ${String(rendered.files.length)} file(s); ${String(written.length)} written, the rest unchanged`,
    );
    const snippet = pictureSnippet(plan, rendered.files);
    log.group("README snippet", snippet.split("\n"));

    let files = written;
    let commit = "";
    if (push === undefined) {
      log.info(`dry run: would commit ${String(written.length)} file(s)`);
    } else {
      files = await push.repo.stage(rendered.files.map((file) => file.output));
      if (files.length === 0) {
        log.info("no output differs from HEAD: nothing to commit");
      } else {
        commit = await push.repo.commit(config.commitMessage, files);
        await push.repo.push(push.branch);
        log.info(
          `committed ${String(files.length)} file(s) as ${commit}, pushed to ${push.branch}`,
        );
      }
    }
    await setOutputs(env.GITHUB_OUTPUT, log, {
      changed: String(files.length > 0),
      commit,
      files: files.join("\n"),
      snippet,
    });
    return 0;
  } catch (error) {
    if (error instanceof ActionError) {
      for (const line of error.lines) log.error(line);
    } else {
      log.error(`internal error (${errorName(error)})`);
    }
    return 1;
  }
}

/**
 * The commit is pushed with the checkout's history, so the checkout must be the tip of the
 * branch on `origin`: anything else (a pull request merge, another branch, a branch that moved)
 * would push commits nobody merged into it, or fail after the files were written.
 */
async function checkPushTarget(repo: GitRepo, branch: string): Promise<void> {
  const remote = await repo.remoteHead(branch);
  const name = quoteForLog(branch);
  if (remote === undefined) {
    throw new ActionError(
      "git",
      `branch ${name} does not exist on origin; check out the branch the Action pushes to`,
    );
  }
  const head = await repo.head();
  if (remote !== head) {
    throw new ActionError(
      "git",
      `the checkout (${head.slice(0, 12)}) is not the tip of branch ${name} on origin (${remote.slice(0, 12)}); check out the branch the Action pushes to, at its latest commit`,
    );
  }
}

/** The settings file of `props-file`, loaded once; a failure becomes `ActionError` (input) with the loader's lines. */
async function loadActionProps(
  config: ActionConfig,
  workspace: string,
): Promise<DesignProps | undefined> {
  if (config.propsFile === undefined) return undefined;
  try {
    return await loadDesignProps(config.propsFile, workspace, { confinedTo: workspace });
  } catch (error) {
    if (error instanceof CliError) throw new ActionError("input", error.lines);
    throw error;
  }
}

/** The manifest of the `manifest` input, loaded inside the workspace; a failure becomes `ActionError` (input) with the loader's lines. */
async function loadActionManifest(
  manifest: string,
  workspace: string,
  variant: RenderVariant | undefined,
): Promise<LoadedRenderManifest> {
  try {
    return await loadRenderManifest(manifest, workspace, {
      confinedTo: workspace,
      ...(variant === undefined ? {} : { variant }),
    });
  } catch (error) {
    if (error instanceof CliError) throw new ActionError("input", error.lines);
    throw error;
  }
}

function warnUnusedSections(
  props: DesignProps,
  plan: readonly PlannedDesign[],
  log: ActionLog,
): void {
  const used = new Set(
    plan.map((entry) => entry.light.entry?.name ?? propsSection(entry.light.design)),
  );
  for (const section of Object.keys(props)) {
    if (!used.has(section)) {
      log.warning(`props-file section ${quoteForLog(section)} names no listed design or render`);
    }
  }
}

async function loadRaster(deps: ActionDeps): Promise<void> {
  if (deps.initRaster === undefined) return;
  try {
    await deps.initRaster();
  } catch (error) {
    const code = errnoCode(error);
    throw new ActionError(
      "render",
      `the raster codecs cannot be loaded${code === undefined ? "" : ` (${code})`}; the Action bundle is incomplete`,
    );
  }
}

async function entryExists(full: string): Promise<boolean> {
  try {
    await lstat(full);
    return true;
  } catch {
    return false;
  }
}

async function setOutputs(
  file: string | undefined,
  log: ActionLog,
  values: ActionOutputValues,
): Promise<void> {
  const target = nonEmpty(file);
  if (target === undefined) {
    log.info(`changed: ${values.changed}`);
    log.info(`commit: ${values.commit}`);
    for (const name of values.files.split("\n").filter((line) => line !== "")) {
      log.info(`file: ${name}`);
    }
    return;
  }
  try {
    await writeActionOutputs(target, values, (text) => log.redact(text));
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    throw new ActionError("output", `the GITHUB_OUTPUT file cannot be written (${code})`);
  }
}

function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

function nonEmpty(text: string | undefined): string | undefined {
  return text === "" ? undefined : text;
}
