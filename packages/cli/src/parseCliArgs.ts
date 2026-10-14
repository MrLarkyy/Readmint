import { parseArgs } from "node:util";
import { isSupportedLocale, supportedLocales } from "@readmint/expr";
import { CliError } from "./CliError.js";
import type { CliCommand, DesignArgs } from "./CliCommand.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";

type DesignCommand = "render" | "validate" | "preview";
type ValueOption = "root" | "data" | "locale" | "time" | "out" | "port";

const valueOptions: ReadonlySet<string> = new Set<ValueOption>([
  "root",
  "data",
  "locale",
  "time",
  "out",
  "port",
]);
const flagOptions: ReadonlySet<string> = new Set(["help", "version"]);

// No host option, ever: the preview listens on 127.0.0.1 only.
const allowed: Readonly<Record<DesignCommand, ReadonlySet<ValueOption>>> = {
  render: new Set(["root", "data", "locale", "time", "out"]),
  validate: new Set(["root", "data", "locale", "time"]),
  preview: new Set(["root", "data", "locale", "port"]),
};

/** Latest frame time the renderer takes (`renderSvg` `time`). */
const maxTime = 86_400_000;
const defaultPreviewPort = 4870;

/** Command-line arguments (without node and the script) to a command; throws `CliError` with exit code 2. */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const { tokens } = parseArgs({
    args: [...argv],
    options: {
      ...Object.fromEntries([...valueOptions].map((name) => [name, { type: "string" as const }])),
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
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
  const common: DesignArgs = {
    design,
    ...optional("root", values.get("root")),
    ...optional("data", values.get("data")),
    ...optional("locale", checkLocale(values.get("locale"))),
  };
  const time = values.get("time");
  const timeArgs = time === undefined ? {} : { time: parseTime(time) };
  switch (command) {
    case "render":
      return { name: "render", ...common, ...timeArgs, ...optional("out", values.get("out")) };
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

function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string };
}

function checkLocale(locale: string | undefined): string | undefined {
  if (locale === undefined) return undefined;
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    usage(`--locale ${quoteForLog(locale)} is not a BCP 47 language tag`);
  }
  if (!isSupportedLocale(locale)) {
    usage(
      `--locale ${quoteForLog(locale)} is not supported (supported: ${supportedLocales.join(", ")})`,
    );
  }
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
