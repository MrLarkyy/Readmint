import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GitRunner } from "../src/index.js";
import { runAction } from "../src/index.js";
import { runGit } from "../src/runGit.js";

/** A canary shaped like a classic personal access token; never a real one. */
export const CANARY = "ghp_CANARYcanary0123456789CANARYcanary01";

/** A PNG of the renderer's own test assets (24x16, own-made). */
export const png: Uint8Array = readFileSync(
  join(import.meta.dirname, "..", "..", "renderer", "test", "assets", "pattern.png"),
);

/** The smoke fixtures CI runs the bundle on: `card.json`, its dark twin and `data.json`. */
export const smokeDir = join(import.meta.dirname, "fixtures", "smoke");

/** A design whose rect height reads `stats.v`. */
export function design(fill = "#0969da"): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [{ type: "rect", x: 0, y: 0, width: 10, height: "{{stats.v}}", fill }],
  };
}

export interface ActionRun {
  readonly code: number;
  readonly log: string;
  /** The GITHUB_OUTPUT file's text. */
  readonly outputText: string;
  /** The outputs parsed from the GITHUB_OUTPUT file. */
  readonly outputs: Record<string, string>;
}

export interface RunOptions {
  readonly runGit?: GitRunner;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  readonly env?: Record<string, string>;
}

/** A temporary folder holding the workspace (`work`) and, with `initGit`, a bare `origin.git`. */
export interface ActionTree {
  readonly base: string;
  readonly root: string;
  readonly origin: string;
  file(relative: string, content: string | Uint8Array | object): Promise<string>;
  read(relative: string): Promise<string>;
  /** Runs the Action with these inputs (names as in action.yml). */
  run(inputs: Record<string, string>, options?: RunOptions): Promise<ActionRun>;
  /** `git init` with one commit on `main`, pushed to the bare `origin`. */
  initGit(): Promise<void>;
  git(...args: string[]): string;
  originGit(...args: string[]): string;
  remove(): Promise<void>;
}

export async function makeActionTree(): Promise<ActionTree> {
  const base = await mkdtemp(join(tmpdir(), "readmint-action-"));
  const root = join(base, "work");
  const origin = join(base, "origin.git");
  await mkdir(root);
  const globalConfig = join(base, "gitconfig");
  await writeFile(globalConfig, "");
  // Isolated from the developer's own git settings (signing, hooks, templates).
  const gitEnvironment: Record<string, string> = {
    ...stringEnv(process.env),
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  const gitIn = (cwd: string, args: string[]): string =>
    execFileSync("git", args, {
      cwd,
      env: gitEnvironment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  const tree: ActionTree = {
    base,
    root,
    origin,
    async file(relative, content) {
      const path = join(root, relative);
      await mkdir(dirname(path), { recursive: true });
      const data =
        typeof content === "string" || content instanceof Uint8Array
          ? content
          : JSON.stringify(content);
      await writeFile(path, data);
      return path;
    },
    read: (relative) => readFile(join(root, relative), "utf8"),
    async run(inputs, options = {}) {
      const outputFile = join(base, `output-${String(++runs)}.txt`);
      await writeFile(outputFile, "");
      const env: Record<string, string> = {
        ...gitEnvironment,
        GITHUB_WORKSPACE: root,
        GITHUB_OUTPUT: outputFile,
        ...options.env,
      };
      for (const [name, value] of Object.entries(inputs)) {
        env[`INPUT_${name.toUpperCase()}`] = value;
      }
      let log = "";
      const code = await runAction(env, {
        write: (text) => {
          log += text;
        },
        runGit: options.runGit ?? runGit,
        cwd: base,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
      const outputText = await readFile(outputFile, "utf8");
      return { code, log, outputText, outputs: parseOutputs(outputText) };
    },
    async initGit() {
      gitIn(base, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
      gitIn(root, ["init", "--quiet", "--initial-branch=main"]);
      await tree.file("README.md", "# test\n");
      gitIn(root, ["add", "README.md"]);
      gitIn(root, ["commit", "--quiet", "-m", "init"]);
      gitIn(root, ["remote", "add", "origin", origin]);
      gitIn(root, ["push", "--quiet", "-u", "origin", "main"]);
    },
    git: (...args) => gitIn(root, args),
    originGit: (...args) => gitIn(base, ["--git-dir", origin, ...args]),
    // Retries: a git child or a scanner can still hold a file for a moment (ENOTEMPTY / EBUSY).
    remove: () => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  };
  return tree;
}

let runs = 0;

/** Parses `name<<delimiter` blocks of a GITHUB_OUTPUT file. */
export function parseOutputs(text: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^([a-z-]+)<<(.+)$/.exec(lines[i] ?? "");
    if (match === null) continue;
    const [, name = "", delimiter] = match;
    const value: string[] = [];
    for (i++; i < lines.length && lines[i] !== delimiter; i++) value.push(lines[i] ?? "");
    outputs[name] = value.join("\n");
  }
  return outputs;
}

/** A runner that records every call and fails the test's expectations when git is run at all. */
export function recordingRunner(answer: GitRunner): {
  runGit: GitRunner;
  calls: { args: readonly string[]; env: Readonly<Record<string, string>>; input?: string }[];
} {
  const calls: {
    args: readonly string[];
    env: Readonly<Record<string, string>>;
    input?: string;
  }[] = [];
  return {
    calls,
    runGit: (args, options) => {
      calls.push({
        args,
        env: options.env,
        ...(options.input === undefined ? {} : { input: options.input }),
      });
      return answer(args, options);
    },
  };
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !name.startsWith("INPUT_")) result[name] = value;
  }
  return result;
}
