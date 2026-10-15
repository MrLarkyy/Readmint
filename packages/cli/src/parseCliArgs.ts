import path from "node:path";
import { parseArgs } from "node:util";
import { CliError } from "./CliError.js";
import type { CliCommand, DesignArgs, RenderArgs } from "./CliCommand.js";
import { ExitCode } from "./ExitCode.js";
import { localeProblem } from "./localeProblem.js";
import { type OutputFormat, outputFormats } from "./OutputFormat.js";
import { quoteForLog } from "./quoteForLog.js";

type DesignCommand = "render" | "validate" | "preview";
type ValueOption =
  | "root"
  | "data"
  | "locale"
  | "time"
  | "out"
  | "port"
  | "format"
  | "scale"
  | "frame-rate"
  | "quality"
  | "login";

const valueOptions: ReadonlySet<string> = new Set<ValueOption>([
  "root",
  "data",
  "locale",
  "time",
  "out",
  "port",
  "format",
  "scale",
  "frame-rate",
  "quality",
  "login",
]);
const flagOptions: ReadonlySet<string> = new Set(["help", "version", "fetch-images", "github"]);

// No host option, ever: the preview listens on 127.0.0.1 only.
const allowed: Readonly<Record<DesignCommand, ReadonlySet<ValueOption>>> = {
  render: new Set([
    "root",
    "data",
    "locale",
    "time",
    "out",
    "format",
    "scale",
    "frame-rate",
    "quality",
    "login",
  ]),
  validate: new Set(["root", "data", "locale", "time", "login"]),
  preview: new Set(["root", "data", "locale", "port", "login"]),
};
/** Prefixes of GitHub tokens (classic, OAuth, user-to-server, server-to-server, refresh, fine-grained). */
const tokenShaped = /^(?:-{1,2}[^=]*=)?(?:gh[pousr]_|github_pat_)/;

/** Latest frame time the renderer takes (`renderSvg` `time`). */
const maxTime = 86_400_000;
const defaultPreviewPort = 4870;
/** GIF delays are whole centiseconds; players stretch anything under 2. */
const maxGifFrameRate = 50;
const formatByExtension: Readonly<Record<string, OutputFormat>> = {
  ".png": "png",
  ".apng": "apng",
  ".webp": "webp",
  ".gif": "gif",
};

/** Command-line arguments (without node and the script) to a command; throws `CliError` with exit code 2. */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  refuseTokens(argv);
  const { tokens } = parseArgs({
    args: [...argv],
    options: {
      ...Object.fromEntries([...valueOptions].map((name) => [name, { type: "string" as const }])),
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      "fetch-images": { type: "boolean" },
      github: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const values = new Map<ValueOption, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  for (const token of tokens) {
    if (token.kind === "positional") positionals.push(token.value);
    if (token.kind !== "option") continue;
    if (flagOptions.has(token.name)) {
      if (token.value !== undefined) usage(`option ${token.rawName} takes no value`);
      flags.add(token.name);
    } else if (valueOptions.has(token.name)) {
      if (token.value === undefined) usage(`option ${token.rawName} needs a value`);
      const name = token.name as ValueOption;
      if (values.has(name)) usage(`option ${token.rawName} is given twice`);
      values.set(name, token.value);
    } else {
      usage(`unknown option ${quoteForLog(token.rawName)}`);
    }
  }
  const [command, ...rest] = positionals;
  if (flags.has("help") || command === "help") return { name: "help" };
  if (flags.has("version")) return { name: "version" };
  if (command === undefined) usage("missing command");
  if (command !== "render" && command !== "validate" && command !== "preview") {
    usage(`unknown command ${quoteForLog(command)}`);
  }
  const [design, extra] = rest;
  if (design === undefined) usage(`${command} needs a design file`);
  if (extra !== undefined) usage(`unexpected argument ${quoteForLog(extra)}`);
  for (const name of values.keys()) {
    if (!allowed[command].has(name)) usage(`option --${name} does not apply to ${command}`);
  }
  const github = flags.has("github");
  if (github && values.has("data")) usage("--github and --data exclude each other");
  if (!github && values.has("login")) usage("option --login needs --github");
  const common: DesignArgs = {
    design,
    ...optional("root", values.get("root")),
    ...optional("data", values.get("data")),
    ...optional("locale", checkLocale(values.get("locale"))),
    ...(flags.has("fetch-images") ? { fetchImages: true } : {}),
    ...(github ? { github: true } : {}),
    ...optional("login", values.get("login")),
  };
  const time = values.get("time");
  const timeArgs = time === undefined ? {} : { time: parseTime(time) };
  switch (command) {
    case "render":
      return { name: "render", ...common, ...timeArgs, ...renderArgs(values) };
    case "validate":
      return { name: "validate", ...common, ...timeArgs };
    case "preview": {
      const port = values.get("port");
      return {
        name: "preview",
        ...common,
        port: port === undefined ? defaultPreviewPort : parsePort(port),
      };
    }
  }
}

/**
 * The token is read from the environment only: an argument holding one would sit in the shell history and the
 * process list, and an error message echoing it would print it. Neither the option nor such a value is ever quoted.
 */
function refuseTokens(argv: readonly string[]): void {
  for (const arg of argv) {
    if (arg === "--token" || arg.startsWith("--token=")) {
      usage(
        "option --token does not exist: the token is read from GH_TOKEN or GITHUB_TOKEN, never from an argument",
      );
    }
  }
  if (argv.some((arg) => tokenShaped.test(arg))) {
    usage(
      "an argument looks like a GitHub token; not printed: the token is read from GH_TOKEN or GITHUB_TOKEN, never from an argument",
    );
  }
}

function renderArgs(values: ReadonlyMap<ValueOption, string>): Omit<RenderArgs, "time"> {
  const out = values.get("out");
  const formatText = values.get("format");
  const format = formatText === undefined ? formatOf(out) : parseFormat(formatText);
  if (format !== "svg" && out === undefined) {
    usage(`--format ${format} needs --out: raster images are never written to standard output`);
  }
  const scale = values.get("scale");
  const frameRate = values.get("frame-rate");
  if (format === "svg") {
    for (const name of ["scale", "frame-rate"] as const) {
      if (values.has(name))
        usage(`option --${name} applies to png, webp, apng and gif output only`);
    }
  }
  const quality = values.get("quality");
  if (quality !== undefined && format !== "webp") {
    usage("option --quality applies to webp output only");
  }
  return {
    format,
    ...optional("out", out),
    ...(scale === undefined ? {} : { scale: parseScale(scale) }),
    ...(frameRate === undefined ? {} : { frameRate: parseFrameRate(frameRate, format) }),
    ...(quality === undefined ? {} : { quality: parseQuality(quality) }),
  };
}

function formatOf(out: string | undefined): OutputFormat {
  const extension = out === undefined ? "" : path.extname(out).toLowerCase();
  return formatByExtension[extension] ?? "svg";
}

function parseFormat(text: string): OutputFormat {
  const format = outputFormats.find((name) => name === text);
  if (format === undefined) {
    usage(`--format must be one of ${outputFormats.join(", ")}, got ${quoteForLog(text)}`);
  }
  return format;
}

function parseScale(text: string): number {
  const scale = /^\d(?:\.\d{1,3})?$/.test(text) ? Number(text) : Number.NaN;
  if (!(scale >= 1 && scale <= 4))
    usage(`--scale must be a number in 1..4, got ${quoteForLog(text)}`);
  return scale;
}

function parseFrameRate(text: string, format: OutputFormat): number {
  const max = format === "gif" ? maxGifFrameRate : 60;
  const frameRate = /^\d{1,2}$/.test(text) ? Number(text) : Number.NaN;
  if (!(frameRate >= 1 && frameRate <= max)) {
    usage(
      `--frame-rate must be a whole number in 1..${String(max)} for ${format}, got ${quoteForLog(text)}`,
    );
  }
  return frameRate;
}

function parseQuality(text: string): number {
  const quality = /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN;
  if (!(quality >= 1 && quality <= 100)) {
    usage(`--quality must be a whole number in 1..100, got ${quoteForLog(text)}`);
  }
  return quality;
}

function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string };
}

function checkLocale(locale: string | undefined): string | undefined {
  if (locale === undefined) return undefined;
  const problem = localeProblem(locale);
  if (problem !== undefined) usage(`--locale ${quoteForLog(locale)} ${problem}`);
  return locale;
}

function parseTime(text: string): number {
  const time = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/.test(text) ? Number(text) : Number.NaN;
  if (!(time <= maxTime)) {
    usage(`--time must be milliseconds in 0..${String(maxTime)}, got ${quoteForLog(text)}`);
  }
  return time;
}

function parsePort(text: string): number {
  const port = /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
  if (!(port <= 65_535)) usage(`--port must be a number in 0..65535, got ${quoteForLog(text)}`);
  return port;
}

function usage(message: string): never {
  throw new CliError(ExitCode.usage, `${message} (see readmint --help)`);
}
