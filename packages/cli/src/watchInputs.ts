import { stat } from "node:fs/promises";
import { errnoCode } from "./errnoCode.js";
import { type SettleState, settleSnapshot } from "./settleSnapshot.js";

export interface WatchInputsOptions {
  /** Files to watch; asked again on every poll (the asset list follows the design). */
  readonly paths: () => readonly string[];
  /** Runs once at the start and after every change; a throw stops the polling and `close` rethrows it. */
  readonly onChange: () => Promise<void>;
  /** Resolves when the next poll is due; must reject once `signal` aborts (on `close`). */
  readonly nextPoll: (signal: AbortSignal) => Promise<void>;
}

export interface InputWatcher {
  /** Stops polling once a running check has finished; rethrows an error that stopped it. */
  close(): Promise<void>;
}

/**
 * Polls the identity (modification time, size, inode) of the input files: the same on every
 * platform, with no recursive-watch gaps, and an asset that does not exist yet is seen when it
 * appears. A change counts once it reads the same on two consecutive polls (`settleSnapshot`), so
 * a file still being written is not rendered half done. The snapshot is taken before each
 * `onChange`, so an edit made during it is not lost.
 */
export async function watchInputs(options: WatchInputsOptions): Promise<InputWatcher> {
  let state: SettleState = { last: await snapshot(options.paths()), pending: undefined };
  await options.onChange();
  const controller = new AbortController();
  const { signal } = controller;
  const poll = async () => {
    for (;;) {
      try {
        await options.nextPoll(signal);
      } catch (error) {
        if (signal.aborted) return;
        throw error;
      }
      const step = settleSnapshot(state, await snapshot(options.paths()));
      state = step.state;
      if (signal.aborted) return;
      if (step.fire) await options.onChange();
    }
  };
  let failure: { error: unknown } | undefined;
  const polling = poll().catch((error: unknown) => {
    failure = { error };
  });
  return {
    async close() {
      controller.abort();
      await polling;
      if (failure !== undefined) throw failure.error;
    },
  };
}

async function snapshot(paths: readonly string[]): Promise<string> {
  const states = await Promise.all(
    paths.map(async (file) => {
      try {
        const stats = await stat(file, { bigint: true });
        return `${file}\0${String(stats.mtimeNs)}:${String(stats.size)}:${String(stats.ino)}`;
      } catch (error) {
        return `${file}\0${errnoCode(error) ?? "error"}`;
      }
    }),
  );
  return states.join("\n");
}
