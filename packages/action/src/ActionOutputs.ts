/** The outputs of `action.yml`, in the order they are written. */
export const ActionOutputs = Object.freeze(["changed", "commit", "files", "snippet"] as const);

export type ActionOutputName = (typeof ActionOutputs)[number];
