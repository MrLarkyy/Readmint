import { isPinnedOlderThan } from "./isPinnedOlderThan.js";

const introducedIn = "0.3.0";

/** Throws when `actionRef` pins a `vX.Y.Z` tag older than the Action input `props-file`, which the settings file needs. */
export function assertActionSupportsSettings(actionRef: string): void {
  if (isPinnedOlderThan(actionRef, introducedIn)) {
    throw new Error(
      `${actionRef} predates props-file (Action v${introducedIn}), which the settings file needs; pin v${introducedIn} or newer`,
    );
  }
}
