import { type OutputFormat, outputExtension } from "@readmint/cli";

/** `<output-dir>/<name>.<ext>`, `/`-separated; the folder `.` writes next to the workspace root. */
export function outputPath(outputDir: string, name: string, format: OutputFormat): string {
  const file = `${name}.${outputExtension(format)}`;
  return outputDir === "." ? file : `${outputDir}/${file}`;
}
