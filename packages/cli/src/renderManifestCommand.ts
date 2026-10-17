import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RenderVariant } from "@readmint/format";
import type { ManifestRenderArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { checkDataNamespaces } from "./checkDataNamespaces.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { imageFetching } from "./imageFetching.js";
import { liveData } from "./liveData.js";
import { loadDesignFile } from "./loadDesignFile.js";
import { loadDesignProps } from "./loadDesignProps.js";
import { loadInputData } from "./loadInputData.js";
import { loadRenderInput } from "./loadRenderInput.js";
import { type LoadedRenderEntry, loadRenderManifest } from "./loadRenderManifest.js";
import { outputExtension } from "./OutputFormat.js";
import { type PictureEntry, pictureHtml } from "./pictureHtml.js";
import { printLines } from "./printLines.js";
import { quoteForLog } from "./quoteForLog.js";
import { relabelLine } from "./relabelLine.js";
import { renderOutput } from "./renderOutput.js";
import { renderOutputOptions } from "./renderOutputOptions.js";

interface WrittenFile {
  readonly file: string;
  readonly bytes: Uint8Array;
}

/**
 * Renders every entry of the manifest, and each variant of it, the way `readmint render` renders the design with the
 * entry's props, and writes `<out-dir>/<name>[.<variant>].<ext>`. All or nothing: every design is loaded before the
 * data, and nothing is written when any render fails (all problems are listed). The `<picture>` snippet of the names
 * goes to standard output.
 */
export async function renderManifestCommand(
  args: ManifestRenderArgs,
  io: CliIo,
): Promise<ExitCode> {
  const manifest = await loadRenderManifest(args.manifest, io.cwd);
  for (const entry of manifest.renders) {
    const file = await loadDesignFile(entry.design, { cwd: io.cwd, root: manifest.folder });
    checkDataNamespaces(file, args.dataJson ?? [], args.dataFeed ?? []);
  }
  const props = args.props === undefined ? undefined : await loadDesignProps(args.props, io.cwd);
  const data = await loadInputData(args, { cwd: io.cwd, ...liveData(args, io) });
  const images = imageFetching(args, io);
  const options = renderOutputOptions(args);
  const extension = outputExtension(args.format);
  const outDir = args.outDir.replaceAll("\\", "/").replace(/\/+$/, "");
  const shown = (file: string): string => `${outDir === "" ? "" : `${outDir}/`}${file}`;
  const problems: string[] = [];
  const written: WrittenFile[] = [];
  const pictures: PictureEntry[] = [];

  for (const entry of manifest.renders) {
    const variants = entry.variants ?? (args.variant === undefined ? [] : [args.variant]);
    const clash = variantClash(manifest.label, entry, variants);
    if (clash.length > 0) {
      problems.push(...clash);
      continue;
    }
    const parts: { file: string; size?: { width: number; height: number } }[] = [];
    for (const variant of [undefined, ...variants]) {
      const label = `${entry.design} (render ${quoteForLog(entry.name)}${variant === undefined ? "" : `, ${variant.name} variant`})`;
      try {
        const input = await loadRenderInput(
          { design: entry.design, root: manifest.folder },
          {
            cwd: io.cwd,
            ...(props === undefined ? {} : { props }),
            ...(data === undefined ? {} : { data }),
            ...images,
            entry: {
              name: entry.name,
              props: entry.props,
              at: entry.at,
              manifest: manifest.label,
            },
            ...(variant === undefined ? {} : { variant }),
          },
        );
        await printLines(
          io.stderr,
          (input.warnings ?? []).map((line) => relabelLine(line, input.file.name, label)),
        );
        const result = await renderOutput(input, [args.format], options);
        if (!result.ok) {
          problems.push(...result.issues.map((issue) => formatIssue(label, issue, "error")));
          continue;
        }
        await printLines(
          io.stderr,
          result.warnings.map((issue) => formatIssue(label, issue, "warning")),
        );
        const [output] = result.outputs;
        if (output === undefined) throw new Error("render produced no output");
        if (output.note !== undefined) await printLines(io.stderr, [output.note]);
        const file = `${entry.name}${variant === undefined ? "" : `.${variant.name}`}.${extension}`;
        written.push({ file, bytes: output.bytes });
        parts.push({ file, ...(output.size === undefined ? {} : { size: output.size }) });
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        problems.push(...error.lines.map((line) => relabelLine(line, entry.design, label)));
      }
    }
    const [light, dark] = parts;
    if (light !== undefined) {
      pictures.push({
        alt: entry.name,
        light: shown(light.file),
        ...(dark === undefined ? {} : { dark: shown(dark.file) }),
        ...(light.size === undefined ? {} : { size: light.size }),
      });
    }
  }
  if (problems.length > 0) throw new CliError(ExitCode.invalid, problems);

  await writeAll(path.resolve(io.cwd, args.outDir), args.outDir, written);
  await io.stdout(`${pictureHtml(pictures)}\n`);
  return ExitCode.ok;
}

/** The run's variant must not set a prop the entry sets: the order of the two would decide the output. */
function variantClash(
  label: string,
  entry: LoadedRenderEntry,
  variants: readonly RenderVariant[],
): string[] {
  const lines: string[] = [];
  for (const variant of variants) {
    for (const prop of Object.keys(variant.props)) {
      if (!Object.hasOwn(entry.props, prop)) continue;
      lines.push(
        `${label}: error duplicate-key at ${entry.at}/props/${prop}: the prop ${prop} is also set by the ${variant.name} variant; set it in one place`,
      );
    }
  }
  return lines;
}

async function writeAll(
  folder: string,
  shownFolder: string,
  files: readonly WrittenFile[],
): Promise<void> {
  try {
    await mkdir(folder, { recursive: true });
    for (const { file, bytes } of files) await writeFile(path.join(folder, file), bytes);
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    throw new CliError(ExitCode.input, `cannot write into ${quoteForLog(shownFolder)} (${code})`, {
      cause: error,
    });
  }
}
