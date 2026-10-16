import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "yaml";

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Workflow {
  permissions: Record<string, string>;
  jobs: { release: { steps: Step[] } };
}

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const workflow = parse(
  readFileSync(join(repoRoot, ".github", "workflows", "release-action.yml"), "utf8"),
) as Workflow;
const steps = workflow.jobs.release.steps;

const tagIndex = steps.findIndex((step) =>
  step.run?.includes('git push origin "refs/tags/$VERSION"'),
);
const releaseIndex = steps.findIndex((step) => step.run?.includes("gh release create"));

test("the release workflow creates the GitHub Release as the step right after the tag push", () => {
  expect(tagIndex).toBeGreaterThan(-1);
  expect(releaseIndex).toBe(tagIndex + 1);
});

test("the Release is created for the pushed tag with generated notes, marked latest, never overwritten", () => {
  const step = steps[releaseIndex];
  const command = step?.run ?? "";
  expect(command).toContain('gh release create "$VERSION"');
  expect(command).toContain("--verify-tag");
  expect(command).toContain("--generate-notes");
  expect(command).toContain("--latest");
  expect(command).not.toMatch(
    /gh release (edit|upload|delete)|--clobber|--force|git push .*--force/,
  );
  expect(step?.env?.["VERSION"]).toBe("${{ inputs.version }}");
});

test("the release workflow needs contents: write and no secret beyond the workflow token", () => {
  expect(workflow.permissions).toEqual({ contents: "write" });
  const source = readFileSync(join(repoRoot, ".github", "workflows", "release-action.yml"), "utf8");
  expect(source.match(/\$\{\{\s*secrets\.[^}]*\}\}/g) ?? []).toEqual([]);
  expect(steps[releaseIndex]?.env?.["GH_TOKEN"]).toBe("${{ github.token }}");
});
