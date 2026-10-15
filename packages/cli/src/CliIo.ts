import type { ImageFetch } from "./RemoteImageOptions.js";

/** What the CLI talks to; `bin.ts` wires it to the process, tests to buffers. */
export interface CliIo {
  /** Standard output: receives the SVG bytes unchanged, and help, version and `ok` lines. */
  readonly stdout: (text: string) => void | Promise<void>;
  /** Standard error: receives escaped lines, each ending in a line feed. */
  readonly stderr: (text: string) => void | Promise<void>;
  /** Folder relative paths in arguments are resolved against. */
  readonly cwd: string;
  /** Aborted on SIGINT or SIGTERM: ends `preview` with exit code 0. */
  readonly signal?: AbortSignal;
  /** How often `preview` checks its input files for changes, in milliseconds; default 300. */
  readonly pollIntervalMs?: number;
  /** `fetch` for `--fetch-images`, the only network use of the CLI; the global one when absent. */
  readonly fetch?: ImageFetch;
}
