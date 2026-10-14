import type { ExitCode } from "./ExitCode.js";

/** A failure the CLI reports as message lines on standard error before it exits with `exitCode`. */
export class CliError extends Error {
  override readonly name = "CliError";
  readonly exitCode: ExitCode;
  /** One line per problem; printed escaped. Never an absolute path, Node error text or raw data. */
  readonly lines: readonly string[];

  constructor(exitCode: ExitCode, lines: string | readonly string[], options?: ErrorOptions) {
    const all = typeof lines === "string" ? [lines] : [...lines];
    super(all.join("\n"), options);
    this.exitCode = exitCode;
    this.lines = all;
  }
}
