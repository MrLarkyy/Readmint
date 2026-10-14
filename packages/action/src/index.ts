export const packageName = "@readmint/action";

export type { ActionConfig } from "./ActionConfig.js";
export type { ActionDeps } from "./ActionDeps.js";
export { ActionError, type ActionErrorKind } from "./ActionError.js";
export {
  type ActionInput,
  type ActionInputName,
  ActionInputs,
  maxCommitMessageLength,
  maxDesigns,
} from "./ActionInputs.js";
export { type ActionOutputName, ActionOutputs } from "./ActionOutputs.js";
export type { GitResult, GitRunner, GitRunOptions } from "./GitRunner.js";
export { readInputs } from "./readInputs.js";
export { runAction } from "./runAction.js";
