/** Process exit codes of the `readmint` command; part of the public contract (docs/cli.md). */
export const ExitCode = Object.freeze({
  /** Done; warnings may have been printed. */
  ok: 0,
  /** The design is invalid, an asset was refused or the render failed. */
  invalid: 1,
  /** Unknown command or option, a missing or extra argument, a bad option value. */
  usage: 2,
  /** A file, folder or port could not be used (missing design, bad fixture data, port in use). */
  input: 3,
  /** `--github` without a token, or the GitHub data could not be loaded. */
  data: 4,
  /** A bug in Readmint (sysexits EX_SOFTWARE). */
  internal: 70,
});

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
