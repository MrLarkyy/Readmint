import { isPinnedOlderThan } from "./isPinnedOlderThan.js";

const introducedIn = "0.4.0";

/** Throws when `actionRef` pins a `vX.Y.Z` tag older than the Action input `manifest`, which the workflow needs. */
export function assertActionSupportsManifest(actionRef: string): void {
  if (isPinnedOlderThan(actionRef, introducedIn)) {
    throw new Error(
      `${actionRef} predates manifest (Action v${introducedIn}), which the workflow needs; pin v${introducedIn} or newer`,
    );
  }
}
