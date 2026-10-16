/** One input of `action.yml`. */
export interface ActionInput {
  readonly required: boolean;
  /** The default exactly as `action.yml` states it; `""` when it states none. */
  readonly default: string;
  /** The default is an expression the runner evaluates; the code sees only its value. */
  readonly runnerDefault: boolean;
}

/** The inputs of `action.yml`, by name; `actionYml.test` keeps the two equal. */
export const ActionInputs = Object.freeze({
  designs: { required: true, default: "", runnerDefault: false },
  "output-dir": { required: false, default: "readmint", runnerDefault: false },
  formats: { required: false, default: "svg", runnerDefault: false },
  scale: { required: false, default: "2", runnerDefault: false },
  "frame-rate": { required: false, default: "", runnerDefault: false },
  quality: { required: false, default: "", runnerDefault: false },
  token: { required: false, default: "${{ github.token }}", runnerDefault: true },
  login: { required: false, default: "${{ github.repository_owner }}", runnerDefault: true },
  "data-file": { required: false, default: "", runnerDefault: false },
  "data-json": { required: false, default: "", runnerDefault: false },
  "data-json-headers": { required: false, default: "", runnerDefault: false },
  "props-file": { required: false, default: "", runnerDefault: false },
  locale: { required: false, default: "", runnerDefault: false },
  "commit-message": { required: false, default: "Update Readmint graphics", runnerDefault: false },
  branch: { required: false, default: "", runnerDefault: false },
  "dry-run": { required: false, default: "false", runnerDefault: false },
} satisfies Record<string, ActionInput>);

export type ActionInputName = keyof typeof ActionInputs;

/** Designs one run renders at most (their dark twins not counted). */
export const maxDesigns = 64;

/** Longest commit message, in UTF-16 code units. */
export const maxCommitMessageLength = 4096;
