import { stat } from "node:fs/promises";
import { errnoCode } from "./errnoCode.js";

export interface WatchInputsOptions {
  /** Files to watch; asked again on every poll (the asset list follows the design). */
  readonly paths: () => readonly string[];
  /** Runs once at the start and after every change; a throw stops the polling and `close` rethrows it. */
  readonly onChange: () => Promise<void>;
  readonly intervalMs: number;
}

export interface InputWatcher {
  /** Stops polling once a running check has finished; rethrows an error that stopped it. */
  close(): Promise<void>;
}

/**
 * Polls the identity (modification time, size, inode) of the input files: the same on every
 * platform, with no recursive-watch gaps, and an asset that does not exist yet is seen when it
 * appears. A change counts once it reads the same on two consecutive polls, so a file still being
 * written is not rendered half done. The snapshot is taken before each `onChange`, so an edit made
 * during it is not lost.
 */
export async function watchInputs(options: WatchInputsOptions): Promise<InputWatcher> {
  let last = await snapshot(options.paths());
  await options.onChange();
  let pending: string | undefined;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let failure: { error: unknown } | undefined;
  const check = async () => {
    const current = await snapshot(options.paths());
    if (current === last) {
      pending = undefined;
    } else if (current === pending) {
      last = current;
      pending = undefined;
      await options.onChange();
    } else {
      pending = current;
    }
  };
  const schedule = () => {
    timer = setTimeout(() => {
      running = check().then(
        () => {
          running = undefined;
          if (!closed) schedule();
        },
        (error: unknown) => {
          running = undefined;
          failure = { error };
        },
      );
    }, options.intervalMs);
  };
  schedule();
  return {
    async close() {
      closed = true;
      clearTimeout(timer);
      await running;
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
