import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, design, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.initGit();
  await tree.file("designs/card.json", design());
  await tree.file("designs/card.dark.json", design("#58a6ff"));
  await tree.file("data.json", { stats: { v: 12 } });
});

afterEach(async () => {
  await tree.remove();
});

const inputs = { designs: "designs/card.json", "data-file": "data.json" };

describe("commit and push", { timeout: 30_000 }, () => {
  test("the first run commits only the outputs and pushes; the commit output is the remote head", async () => {
    const run = await tree.run(inputs);
    expect(run.log).not.toContain("::error::");
    expect(run.code).toBe(0);
    const remote = tree.originGit("rev-parse", "main");
    expect(run.outputs).toMatchObject({
      changed: "true",
      commit: remote,
      files: "readmint/card.svg\nreadmint/card.dark.svg",
    });
    expect(tree.git("show", "--name-only", "--format=%an <%ae>%n%s", "HEAD").split("\n")).toEqual([
      "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
      "Update Readmint graphics",
      "",
      "readmint/card.dark.svg",
      "readmint/card.svg",
    ]);
  });

  test("a second run over unchanged inputs writes nothing and commits nothing", async () => {
    await tree.run(inputs);
    const remote = tree.originGit("rev-parse", "main");
    const head = tree.git("rev-parse", "HEAD");
    const run = await tree.run(inputs);
    expect(run.code).toBe(0);
    expect(run.outputs).toMatchObject({ changed: "false", commit: "", files: "" });
    expect(run.log).toContain("nothing to commit");
    expect(tree.git("rev-parse", "HEAD")).toBe(head);
    expect(tree.originGit("rev-parse", "main")).toBe(remote);
  });

  test("a changed design commits only the output that changed", async () => {
    await tree.run(inputs);
    await tree.file("designs/card.dark.json", design("#ff0000"));
    const run = await tree.run({ ...inputs, "commit-message": "graphics: dark" });
    expect(run.outputs).toMatchObject({ changed: "true", files: "readmint/card.dark.svg" });
    expect(tree.git("show", "--name-only", "--format=%s", "HEAD").split("\n")).toEqual([
      "graphics: dark",
      "",
      "readmint/card.dark.svg",
    ]);
  });

  test("an unrelated staged file stays staged and out of the commit", async () => {
    await tree.file("notes.txt", "mine\n");
    tree.git("add", "notes.txt");
    const run = await tree.run(inputs);
    expect(run.code).toBe(0);
    expect(tree.git("show", "--name-only", "--format=", "HEAD").split("\n")).toEqual([
      "readmint/card.dark.svg",
      "readmint/card.svg",
    ]);
    expect(tree.git("diff", "--cached", "--name-only")).toBe("notes.txt");
  });

  test("pushes to the branch input", async () => {
    const run = await tree.run({ ...inputs, branch: "graphics" });
    expect(run.code).toBe(0);
    expect(tree.originGit("rev-parse", "graphics")).toBe(run.outputs.commit);
  });

  test("a detached HEAD without the branch input is an error before anything is written", async () => {
    tree.git("checkout", "--quiet", "--detach");
    const run = await tree.run(inputs);
    expect(run.code).toBe(1);
    expect(run.log).toBe("::error::HEAD is detached; set the branch input to push to\n");
    expect(tree.git("status", "--porcelain", "--untracked-files=all")).not.toContain("readmint/");
  });

  test("a branch that moved on the remote rejects the push: exit 1, nothing rebased", async () => {
    const other = join(tree.base, "other");
    execFileSync("git", ["clone", "--quiet", tree.origin, other], { env: gitTestEnv() });
    execFileSync("git", ["commit", "--quiet", "--allow-empty", "-m", "elsewhere"], {
      cwd: other,
      env: gitTestEnv(),
    });
    execFileSync("git", ["push", "--quiet", "origin", "main"], { cwd: other, env: gitTestEnv() });
    const remote = tree.originGit("rev-parse", "main");
    const run = await tree.run(inputs);
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::git push exited with 1");
    expect(run.log).toContain("persist-credentials");
    expect(tree.originGit("rev-parse", "main")).toBe(remote);
    expect(run.outputText).toBe("");
  });
});

function gitTestEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(tree.base, "gitconfig"),
    GIT_AUTHOR_NAME: "Other",
    GIT_AUTHOR_EMAIL: "other@example.invalid",
    GIT_COMMITTER_NAME: "Other",
    GIT_COMMITTER_EMAIL: "other@example.invalid",
  };
}
