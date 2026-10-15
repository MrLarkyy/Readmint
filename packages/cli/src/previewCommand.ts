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
import { tokenSecrets } from "./githubToken.js";
import { imageFetching } from "./imageFetching.js";
import { liveData } from "./liveData.js";
import type { DesignFile } from "./loadDesignFile.js";
import { loadRenderInput } from "./loadRenderInput.js";
import { retryWhileChanging } from "./retryWhileChanging.js";
import { PreviewServer, type PreviewUpdate } from "./PreviewServer.js";
import { previewSecret } from "./previewSecret.js";
import { openInBrowser } from "./openInBrowser.js";
import { printLines } from "./printLines.js";
import { redactSecrets } from "./redactSecrets.js";
import { renderInput } from "./renderInput.js";
import { watchedAssetPaths } from "./watchedAssetPaths.js";
import { watchInputs } from "./watchInputs.js";

type PreviewArgs = Extract<CliCommand, { name: "preview" }>;

/**
 * Serves the render on http://127.0.0.1:<port>/ and re-renders when the design, the fixture data or
 * an asset changes; a failing render keeps the last SVG and shows its issues. Ends with exit code 0
 * when `io.signal` aborts. `--github` data is loaded once, before the server starts: a design edit never costs
 * GitHub requests. With that token-scoped data the routes live under a per-session secret path
 * (http://127.0.0.1:<port>/<secret>/), printed once and kept in memory only. With `open` the printed address is
 * handed to the browser after it is printed, without waiting; a failure to do so costs one fixed line.
 */
export async function previewCommand(args: PreviewArgs, io: CliIo): Promise<ExitCode> {
  const { loadData } = liveData(args, io, io.signal);
  let live: { readonly data?: Record<string, unknown> };
  try {
    live = loadData === undefined ? {} : { data: await loadData() };
  } catch (error) {
    if (io.signal?.aborted === true) return ExitCode.ok;
    throw error;
  }
  const secret = loadData === undefined ? undefined : previewSecret();
  const server = new PreviewServer(secret === undefined ? {} : { secret });
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
    // The page shows the issues too, and it is not standard error: redacted here as well.
    const secrets = tokenSecrets(io.env ?? {});
    const rebuild = async () => {
      const rendered = await renderUpdate(args, io, live, (file) => {
        assets = watchedAssetPaths(file);
      });
      const update = {
        ...rendered,
        issues: rendered.issues.map((line) => redactSecrets(line, secrets)),
      };
      if (server.update(update)) await printLines(io.stderr, update.issues);
    };
    const watcher = await watchInputs({
      paths: () => [...inputs, ...assets],
      onChange: rebuild,
      nextPoll: (signal) => sleep(io.pollIntervalMs ?? 300, undefined, { signal }),
    });
    try {
      const base = `http://127.0.0.1:${String(port)}/`;
      const address = secret === undefined ? base : `${base}${secret}/`;
      await printLines(io.stderr, [`preview: ${address}`]);
      if (args.open === true) void openAddress(address, io);
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
  live: { readonly data?: Record<string, unknown> },
  onDesignFile: (file: DesignFile) => void,
): Promise<PreviewUpdate> {
  let lines: readonly string[];
  try {
    // A save racing the read is read again, not shown as an issue.
    const input = await retryWhileChanging(() =>
      loadRenderInput(args, {
        cwd: io.cwd,
        onDesignFile,
        ...live,
        ...imageFetching(args, io, io.signal),
      }),
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

/** Never rethrows and never prints the opener's message: it can echo the address, which holds the secret. */
async function openAddress(address: string, io: CliIo): Promise<void> {
  if (io.signal?.aborted === true) return;
  try {
    await (
      io.openUrl ?? ((url) => openInBrowser(url, io.env === undefined ? {} : { env: io.env }))
    )(address);
  } catch (error) {
    const code = errnoCode(error);
    const suffix = code !== undefined && /^[A-Z][A-Z0-9_]{1,31}$/.test(code) ? ` (${code})` : "";
    try {
      await printLines(io.stderr, [
        `preview: cannot open a browser${suffix}; open the address above`,
      ]);
    } catch {
      // standard error closed: nothing left to tell
    }
  }
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
