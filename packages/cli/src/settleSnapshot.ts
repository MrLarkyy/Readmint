/** What the watcher remembers between polls: the snapshot last reported, and a change seen once. */
export interface SettleState {
  readonly last: string;
  readonly pending: string | undefined;
}

export interface SettleStep {
  readonly state: SettleState;
  /** The change read the same on two consecutive polls: report it. */
  readonly fire: boolean;
}

/**
 * Decides one poll: a snapshot that differs from `last` is held as `pending`, and reported only
 * when the next poll reads it again; one back to `last` drops the pending change.
 */
export function settleSnapshot(state: SettleState, current: string): SettleStep {
  if (current === state.last) {
    return { state: { last: state.last, pending: undefined }, fire: false };
  }
  if (current === state.pending) {
    return { state: { last: current, pending: undefined }, fire: true };
  }
  return { state: { last: state.last, pending: current }, fire: false };
}
