import type { GitHubSourceOptions } from "@readmint/data-github";
import { beforeEach, describe, expect, test, vi } from "vitest";

const received: GitHubSourceOptions[] = [];

vi.mock("@readmint/data-github", async (importOriginal) => {
  const original = await importOriginal<typeof import("@readmint/data-github")>();
  return {
    ...original,
    loadGitHubData: (options: GitHubSourceOptions) => {
      received.push(options);
      return Promise.reject(new original.GitHubDataError("network", "stop here"));
    },
  };
});

const { loadLiveData } = await import("../src/loadLiveData.js");

beforeEach(() => {
  received.length = 0;
});

describe("loadLiveData and the commit reading deadline", () => {
  test("a commit cap above 0 hands the loader its own deadline and the cap", async () => {
    await loadLiveData({ token: "t", languageCommitCap: 50 }).catch(() => undefined);
    expect(received).toHaveLength(1);
    expect(received[0]?.languageCommitCap).toBe(50);
    expect(received[0]?.languageSignal).toBeInstanceOf(AbortSignal);
    expect(received[0]?.languageSignal).not.toBe(received[0]?.signal);
    expect(received[0]?.languageSignal?.aborted).toBe(false);
  });

  test("without a cap, or with 0, the loader gets neither", async () => {
    await loadLiveData({ token: "t" }).catch(() => undefined);
    await loadLiveData({ token: "t", languageCommitCap: 0 }).catch(() => undefined);
    expect(received).toHaveLength(2);
    for (const options of received) {
      expect(options).not.toHaveProperty("languageSignal");
      expect(options).not.toHaveProperty("languageCommitCap");
    }
  });
});
