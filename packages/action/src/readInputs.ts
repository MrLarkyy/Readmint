import path from "node:path";
import {
  type DataFeedSpec,
  type DataJsonSpec,
  localeProblem,
  type OutputFormat,
  outputFormats,
  parseDataFeedArgs,
  parseDataJsonArgs,
  quoteForLog,
  renderVariant,
} from "@readmint/cli";
import { GitHubLimits } from "@readmint/data-github";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";
import {
  type ActionInputName,
  ActionInputs,
  maxCommitMessageLength,
  maxDesigns,
} from "./ActionInputs.js";
import { cacheDirProblem } from "./cacheDirProblem.js";
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
 * `ActionError` (input) listing every problem (`workspace` anchors a relative `cache-dir`); the token is never part of a message.
 */
export function readInputs(
  env: Env,
  workspace = path.resolve(env.GITHUB_WORKSPACE?.trim() || "."),
): ActionConfig {
  const problems: string[] = [];
  const value = (name: ActionInputName): string => {
    const raw = env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";
    const input = ActionInputs[name];
    return raw !== "" || input.runnerDefault ? raw : input.default;
  };

  const designs = lines(value("designs"));
  const manifestText = value("manifest");
  const manifest = manifestText.replaceAll("\\", "/");
  if (manifestText !== "" && designs.length > 0) {
    problems.push("inputs designs and manifest are exclusive; set one");
  } else if (manifestText !== "") {
    const reason = checkRelativePath(manifestText);
    if (reason !== undefined) {
      problems.push(`input manifest ${quoteForLog(manifestText)} ${reason}`);
    }
  } else {
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
  if (dataFile !== "") {
    const reason = checkRelativePath(dataFile);
    if (reason !== undefined) problems.push(`input data-file ${quoteForLog(dataFile)} ${reason}`);
  }
  if (dataFile === "" && token === "") {
    problems.push("input token is empty; pass a token or a data-file");
  }

  const dataJson = readDataJson(
    lines(value("data-json")),
    lines(value("data-json-headers")),
    problems,
  );
  if (dataFile === "" && dataJson.some((spec) => spec.namespace === "github")) {
    problems.push(
      "input data-json: namespace github clashes with the GitHub data; name the JSON source another namespace",
    );
  }
  const dataFeed = readDataFeed(
    lines(value("data-feed")),
    lines(value("data-feed-limits")),
    dataJson,
    problems,
  );
  if (dataFile === "" && dataFeed.some((spec) => spec.namespace === "github")) {
    problems.push(
      "input data-feed: namespace github clashes with the GitHub data; name the feed another namespace",
    );
  }

  const propsFile = value("props-file");
  if (propsFile !== "") {
    const reason = checkRelativePath(propsFile);
    if (reason !== undefined) problems.push(`input props-file ${quoteForLog(propsFile)} ${reason}`);
  }
  const variantName = value("variant");
  const variant = variantName === "" ? undefined : renderVariant(variantName);
  if (variantName !== "" && variant === undefined) {
    problems.push("input variant must be empty or one of: dark");
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

  const excludeRepositories = lines(value("exclude-repositories").replace(/,/g, "\n"));
  if (dataFile !== "" && excludeRepositories.length > 0) {
    problems.push(
      "input exclude-repositories applies to GitHub data only; it cannot go with data-file",
    );
  }
  const capText = value("language-commit-cap");
  const cap = /^\d{1,4}$/.test(capText) ? Number(capText) : Number.NaN;
  if (capText !== "" && !(cap >= 0 && cap <= GitHubLimits.maxLanguageCommitCap)) {
    problems.push(
      `input language-commit-cap ${quoteForLog(capText)} is not a whole number in 0..${String(GitHubLimits.maxLanguageCommitCap)}`,
    );
  } else if (capText !== "" && dataFile !== "") {
    problems.push(
      "input language-commit-cap applies to GitHub data only; it cannot go with data-file",
    );
  }
  const cacheDir = value("cache-dir");
  // eslint-disable-next-line no-control-regex -- control characters are what is refused here
  if (/[\u0000-\u001f\u007f]/.test(cacheDir)) {
    problems.push(`input cache-dir ${quoteForLog(cacheDir)} contains a control character`);
  } else if (cacheDir !== "" && dataFile !== "") {
    problems.push("input cache-dir applies to GitHub data only; it cannot go with data-file");
  } else if (cacheDir !== "") {
    const why = cacheDirProblem(cacheDir, workspace);
    if (why !== undefined) problems.push(`input cache-dir ${quoteForLog(cacheDir)} ${why}`);
  }
  if (problems.length > 0) throw new ActionError("input", problems);
  return {
    designs,
    ...(manifestText === "" ? {} : { manifest }),
    outputDir,
    formats,
    scale,
    ...(frameRateText === "" ? {} : { frameRate }),
    ...(qualityText === "" ? {} : { quality }),
    token: dataFile === "" ? token : "",
    login: value("login"),
    ...(excludeRepositories.length === 0 ? {} : { excludeRepositories }),
    ...(capText === "" || cap === 0 ? {} : { languageCommitCap: cap }),
    ...(cacheDir === "" ? {} : { cacheDir: path.resolve(workspace, cacheDir) }),
    ...(dataFile === "" ? {} : { dataFile }),
    ...(dataJson.length === 0 ? {} : { dataJson }),
    ...(dataFeed.length === 0 ? {} : { dataFeed }),
    ...(propsFile === "" ? {} : { propsFile }),
    ...(variant === undefined ? {} : { variant }),
    ...(locale === "" ? {} : { locale }),
    commitMessage,
    ...(branch === "" ? {} : { branch }),
    dryRun: dryRun ?? false,
  };
}

/** The `data-json` lines as specs; a file source must name a place inside the workspace. */
function readDataJson(
  sources: readonly string[],
  headers: readonly string[],
  problems: string[],
): readonly DataJsonSpec[] {
  const parsed = parseDataJsonArgs(sources, headers);
  for (const problem of parsed.problems) problems.push(`input data-json: ${problem}`);
  for (const spec of parsed.specs) {
    if (/^https:\/\//i.test(spec.source)) continue;
    const reason = checkRelativePath(spec.source);
    if (reason !== undefined) {
      problems.push(`input data-json: the file of namespace ${spec.namespace} ${reason}`);
    }
  }
  return parsed.specs;
}

/** The `data-feed` lines as specs; a namespace a `data-json` source has too is a problem. */
function readDataFeed(
  sources: readonly string[],
  limits: readonly string[],
  dataJson: readonly DataJsonSpec[],
  problems: string[],
): readonly DataFeedSpec[] {
  const parsed = parseDataFeedArgs(sources, limits);
  for (const problem of parsed.problems) problems.push(`input data-feed: ${problem}`);
  const json = new Set(dataJson.map((spec) => spec.namespace));
  for (const spec of parsed.specs) {
    if (json.has(spec.namespace)) {
      problems.push(
        `input data-feed: namespace ${spec.namespace} is also a data-json namespace; name one of them another namespace`,
      );
    }
  }
  return parsed.specs;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
