export const packageName = "@readmint/action";

export type { ActionConfig } from "./ActionConfig.js";
export type { ActionDeps } from "./ActionDeps.js";
export { ActionError, type ActionErrorKind } from "./ActionError.js";
export {
  type ActionInput,
  type ActionInputName,
  ActionInputs,
  type ActionOutputName,
  ActionOutputs,
  maxCommitMessageLength,
  maxDesigns,
} from "./ActionInputs.js";
export type { GitResult, GitRunner, GitRunOptions } from "./GitRunner.js";
export { readInputs } from "./readInputs.js";
export { runAction } from "./runAction.js";
