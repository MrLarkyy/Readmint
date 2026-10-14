import type { GitHubFetch } from "@readmint/data-github";
import type { GitRunner } from "./GitRunner.js";

/** What `runAction` talks to; `main.ts` wires the process, tests their own fakes. */
export interface ActionDeps {
  /** The job log: receives finished lines, each ending in a line feed. */
  readonly write: (text: string) => void;
  readonly runGit: GitRunner;
  /** The workspace when `GITHUB_WORKSPACE` is not set (a local run). */
  readonly cwd: string;
  /** `fetch` for the GitHub load; the global one when absent. */
  readonly fetch?: GitHubFetch;
}
