import { expect, test } from "vitest";
import { gitEnv } from "../src/gitEnv.js";

test("git runs without the inputs, tracing, identity overrides or anything holding a secret", () => {
  const env = gitEnv(
    {
      PATH: "/bin",
      HOME: "/home/runner",
      INPUT_TOKEN: "abcd-token",
      "INPUT_COMMIT-MESSAGE": "m",
      GIT_TRACE: "1",
      GIT_TRACE_CURL: "1",
      GIT_CURL_VERBOSE: "1",
      GIT_AUTHOR_NAME: "x",
      GIT_COMMITTER_EMAIL: "y",
      GH_TOKEN: "abcd-token",
      HEADER: "Bearer abcd-token",
      SHORT: "ab",
      UNSET: undefined,
    },
    ["abcd-token", "ab"],
  );
  expect(env).toEqual({
    PATH: "/bin",
    HOME: "/home/runner",
    SHORT: "ab",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  });
});
