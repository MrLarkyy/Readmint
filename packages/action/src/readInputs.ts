import path from "node:path";
import { localeProblem, type OutputFormat, outputFormats, quoteForLog } from "@readmint/cli";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";
import {
  type ActionInputName,
  ActionInputs,
  maxCommitMessageLength,
  maxDesigns,
} from "./ActionInputs.js";
import { checkRelativePath } from "./checkRelativePath.js";
import { isBranchName } from "./isBranchName.js";

type Env = Readonly<Record<string, string | undefined>>;

/** GIF delays are whole centiseconds; players stretch anything under 2. */
const maxGifFrameRate = 50;

const yamlBooleans: Readonly<Record<string, boolean>> = {
  true: true,
  True: true,
  TRUE: true,
  false: false,
  False: false,
  FALSE: false,
};

/**
 * Reads the inputs the runner passes as `INPUT_<NAME>` (upper case, hyphens kept), trims them,
 * applies the `action.yml` defaults to absent or blank values and checks them. Throws
 * `ActionError` (input) listing every problem; the token is never part of a message.
 */
export function readInputs(env: Env): ActionConfig {
  const problems: string[] = [];
  const value = (name: ActionInputName): string => {
    const raw = env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";
    const input = ActionInputs[name];
    return raw !== "" || input.runnerDefault ? raw : input.default;
  };

  const designs = lines(value("designs"));
  if (designs.length === 0) problems.push("input designs lists no design file");
  if (designs.length > maxDesigns) {
    problems.push(
      `input designs lists ${String(designs.length)} files; at most ${String(maxDesigns)}`,
    );
  }
  for (const design of designs) {
    const reason = checkRelativePath(design);
    if (reason !== undefined) problems.push(`design ${quoteForLog(design)} ${reason}`);
  }

  const outputText = value("output-dir");
  const outputReason = checkRelativePath(outputText);
  const outputDir = path.posix.normalize(outputText.replaceAll("\\", "/")).replace(/\/+$/, "");
  if (outputReason !== undefined) {
    problems.push(`input output-dir ${quoteForLog(outputText)} ${outputReason}`);
  } else if (outputDir.split("/")[0]?.toLowerCase() === ".git") {
    problems.push(`input output-dir ${quoteForLog(outputText)} is inside the .git folder`);
  }

  const formats: OutputFormat[] = [];
  const listedFormats = value("formats")
    .split(/[,\r\n]/)
    .map((format) => format.trim())
    .filter((format) => format !== "");
  for (const text of listedFormats) {
    const format = outputFormats.find((name) => name === text);
    if (format === undefined) {
      problems.push(
        `input formats: ${quoteForLog(text)} is not one of ${outputFormats.join(", ")}`,
      );
    } else if (!formats.includes(format)) {
      formats.push(format);
    }
  }
  if (listedFormats.length === 0) problems.push("input formats lists no format");
  if (formats.includes("png") && formats.includes("apng")) {
    problems.push("input formats lists png and apng, which both write .png files; list one");
  }

  const scaleText = value("scale");
  const scale = /^\d(?:\.\d{1,3})?$/.test(scaleText) ? Number(scaleText) : Number.NaN;
  if (!(scale >= 1 && scale <= 4)) {
    problems.push(`input scale ${quoteForLog(scaleText)} is not a number in 1..4`);
  }

  const frameRateText = value("frame-rate");
  const maxFrameRate = formats.includes("gif") ? maxGifFrameRate : 60;
  const frameRate = /^\d{1,2}$/.test(frameRateText) ? Number(frameRateText) : Number.NaN;
  if (frameRateText !== "" && !(frameRate >= 1 && frameRate <= maxFrameRate)) {
    problems.push(
      `input frame-rate ${quoteForLog(frameRateText)} is not a whole number in 1..${String(maxFrameRate)}${formats.includes("gif") ? " (gif)" : ""}`,
    );
  }

  const qualityText = value("quality");
  const quality = /^\d{1,3}$/.test(qualityText) ? Number(qualityText) : Number.NaN;
  if (qualityText !== "") {
    if (!(quality >= 1 && quality <= 100)) {
      problems.push(`input quality ${quoteForLog(qualityText)} is not a whole number in 1..100`);
    } else if (!formats.includes("webp")) {
      problems.push("input quality applies to webp output only; formats lists no webp");
    }
  }

  const token = value("token");
  const dataFile = value("data-file");
  if (dataFile === "" && token === "") {
    problems.push("input token is empty; pass a token or a data-file");
  }

  const locale = value("locale");
  const localeReason = locale === "" ? undefined : localeProblem(locale);
  if (localeReason !== undefined)
    problems.push(`input locale ${quoteForLog(locale)} ${localeReason}`);

  const commitMessage = value("commit-message");
  if (commitMessage.length > maxCommitMessageLength) {
    problems.push(
      `input commit-message is longer than ${String(maxCommitMessageLength)} characters`,
    );
  }

  const branch = value("branch");
  if (branch.startsWith("refs/")) {
    problems.push(`input branch ${quoteForLog(branch)} must be a branch name without refs/`);
  } else if (branch !== "" && !isBranchName(branch)) {
    problems.push(`input branch ${quoteForLog(branch)} is not a valid branch name`);
  }

  const dryRunText = value("dry-run");
  const dryRun = yamlBooleans[dryRunText];
  if (dryRun === undefined) {
    problems.push(`input dry-run ${quoteForLog(dryRunText)} is not true or false`);
  }

  if (problems.length > 0) throw new ActionError("input", problems);
  return {
    designs,
    outputDir,
    formats,
    scale,
    ...(frameRateText === "" ? {} : { frameRate }),
    ...(qualityText === "" ? {} : { quality }),
    token: dataFile === "" ? token : "",
    login: value("login"),
    ...(dataFile === "" ? {} : { dataFile }),
    ...(locale === "" ? {} : { locale }),
    commitMessage,
    ...(branch === "" ? {} : { branch }),
    dryRun: dryRun ?? false,
  };
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
