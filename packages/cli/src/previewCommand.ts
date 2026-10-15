import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AssetPathError } from "./AssetPathError.js";
import type { CliCommand } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { errnoCode } from "./errnoCode.js";
import { escapeForLog } from "./escapeForLog.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { imageFetching } from "./imageFetching.js";
import type { DesignFile } from "./loadDesignFile.js";
import { loadRenderInput } from "./loadRenderInput.js";
import { retryWhileChanging } from "./retryWhileChanging.js";
import { PreviewServer, type PreviewUpdate } from "./PreviewServer.js";
import { printLines } from "./printLines.js";
import { renderInput } from "./renderInput.js";
import { watchedAssetPaths } from "./watchedAssetPaths.js";
import { watchInputs } from "./watchInputs.js";

type PreviewArgs = Extract<CliCommand, { name: "preview" }>;

/**
 * Serves the render on http://127.0.0.1:<port>/ and re-renders when the design, the fixture data or
 * an asset changes; a failing render keeps the last SVG and shows its issues. Ends with exit code 0
 * when `io.signal` aborts.
 */
export async function previewCommand(args: PreviewArgs, io: CliIo): Promise<ExitCode> {
  const server = new PreviewServer();
  let port: number;
  try {
    ({ port } = await server.listen(args.port));
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    const at = `port ${String(args.port)}`;
    throw new CliError(
      ExitCode.input,
      code === "EADDRINUSE"
        ? `${at} is already in use; pass another --port`
        : `cannot listen on ${at} (${code})`,
      { cause: error },
    );
  }
  try {
    const inputs = [path.resolve(io.cwd, args.design)];
    if (args.data !== undefined) inputs.push(path.resolve(io.cwd, args.data));
    let assets: readonly string[] = [];
    const rebuild = async () => {
      const update = await renderUpdate(args, io, (file) => {
        assets = watchedAssetPaths(file);
      });
      if (server.update(update)) await printLines(io.stderr, update.issues);
    };
    const watcher = await watchInputs({
      paths: () => [...inputs, ...assets],
      onChange: rebuild,
      nextPoll: (signal) => sleep(io.pollIntervalMs ?? 300, undefined, { signal }),
    });
    try {
      await printLines(io.stderr, [`preview: http://127.0.0.1:${String(port)}/`]);
      await aborted(io.signal);
    } finally {
      await watcher.close();
    }
  } finally {
    await server.close();
  }
  return ExitCode.ok;
}

async function renderUpdate(
  args: PreviewArgs,
  io: CliIo,
  onDesignFile: (file: DesignFile) => void,
): Promise<PreviewUpdate> {
  let lines: readonly string[];
  try {
    // A save racing the read is read again, not shown as an issue.
    const input = await retryWhileChanging(() =>
      loadRenderInput(args, { cwd: io.cwd, onDesignFile, ...imageFetching(args, io, io.signal) }),
    );
    const name = input.file.name;
    const result = renderInput(input, args);
    if (result.ok) {
      const warnings = result.warnings.map((issue) => formatIssue(name, issue, "warning"));
      return { svg: result.svg, issues: warnings.map(escapeForLog) };
    }
    lines = result.issues.map((issue) => formatIssue(name, issue, "error"));
  } catch (error) {
    if (error instanceof CliError) lines = error.lines;
    else if (error instanceof AssetPathError) lines = [error.message];
    else lines = [`internal error: ${error instanceof Error ? error.message : String(error)}`];
  }
  return { issues: lines.map(escapeForLog) };
}

function aborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined) return;
    if (signal.aborted) resolve();
    else
      signal.addEventListener(
        "abort",
        () => {
          resolve();
        },
        { once: true },
      );
  });
}
