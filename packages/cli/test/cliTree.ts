import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type CliIo, runCli } from "../src/index.js";

/** A PNG of the renderer's own test assets (24x16, own-made). */
export const png: Uint8Array = readFileSync(
  join(import.meta.dirname, "..", "..", "renderer", "test", "assets", "pattern.png"),
);

/** A valid design: a rect whose height is bound to `{{v}}`, and an image read from `logo.png`. */
export function boundDesign(binding = "{{v}}"): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    assets: { images: { logo: { src: "logo.png" } } },
    layers: [
      { type: "rect", x: 0, y: 0, width: 10, height: binding, fill: "#0969da" },
      { type: "image", asset: "logo", x: 12, y: 0, width: 24, height: 16 },
    ],
  };
}

/** A valid design without bindings or assets. */
export const plainDesign = {
  version: 0,
  canvas: { width: 20, height: 10 },
  layers: [{ type: "rect", width: 10, height: 10, fill: "#1a7f37" }],
};

export interface CliRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A temporary folder the CLI runs in. */
export interface CliTree {
  readonly root: string;
  /** Writes a file below `root` (an object as JSON), creating its folders; returns its path. */
  file(relative: string, content: string | Uint8Array | object): Promise<string>;
  run(argv: readonly string[], io?: Partial<CliIo>): Promise<CliRun>;
  remove(): Promise<void>;
}

export async function makeCliTree(): Promise<CliTree> {
  const root = await mkdtemp(join(tmpdir(), "readmint-cli-"));
  return {
    root,
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
    async run(argv, io = {}) {
      let stdout = "";
      let stderr = "";
      const code = await runCli(argv, {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
        cwd: root,
        ...io,
      });
      return { code, stdout, stderr };
    },
    remove: () => rm(root, { recursive: true, force: true }),
  };
}
