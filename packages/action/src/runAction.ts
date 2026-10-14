import { lstat } from "node:fs/promises";
import path from "node:path";
import type { ActionDeps } from "./ActionDeps.js";
import { ActionError } from "./ActionError.js";
import { ActionLog } from "./ActionLog.js";
import { errnoCode } from "./errnoCode.js";
import { gitEnv } from "./gitEnv.js";
import { GitRepo } from "./GitRepo.js";
import { loadActionData } from "./loadActionData.js";
import { pictureSnippet } from "./pictureSnippet.js";
import { planOutputs } from "./planOutputs.js";
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
    const workspace = path.resolve(deps.cwd, nonEmpty(env.GITHUB_WORKSPACE) ?? ".");
    const plan = await planOutputs(config.designs, config.outputDir, (design) =>
      entryExists(path.resolve(workspace, design)),
    );

    let push: { repo: GitRepo; branch: string } | undefined;
    if (!config.dryRun) {
      const repo = new GitRepo(deps.runGit, workspace, gitEnv(env, secrets));
      const branch = config.branch ?? (await repo.currentBranch());
      if (branch === undefined) {
        throw new ActionError("git", "HEAD is detached; set the branch input to push to");
      }
      await repo.checkBranchName(branch);
      push = { repo, branch };
    }

    const data = await loadActionData(config, workspace, deps.fetch);
    const rendered = await renderAll(plan, workspace, data, config.locale);
    for (const warning of rendered.warnings) log.warning(warning);
    const written = await writeOutputs(workspace, config.outputDir, rendered.files);
    log.info(
      `rendered ${String(rendered.files.length)} file(s); ${String(written.length)} written, the rest unchanged`,
    );
    const snippet = pictureSnippet(plan);
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
