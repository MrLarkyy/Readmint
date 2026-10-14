import { relative, resolve, sep } from "node:path";
import type { BrowserCommand } from "vitest/node";
import type { GoldenSuite } from "../GoldenSuite.js";
import { GoldenStore } from "../node/GoldenStore.js";
import { checkBrowserRender } from "../node/checkBrowserRender.js";
import type { GoldenBrowserRequest, GoldenBrowserResult } from "./GoldenBrowserRequest.js";

const glueSuffix = ".golden.browser.test.ts";
const maxBase64Length = 64 * 1024 * 1024;

/**
 * Runs in Node on behalf of a browser test: renders the suite's fixture with the Node render path and
 * compares it with what the browser produced. The suite file is derived from the calling test file,
 * never from the request, and must sit in `packages/<name>/test/` of the repository.
 */
export const goldenBrowserCheck: BrowserCommand<
  [GoldenBrowserRequest],
  GoldenBrowserResult
> = async (context, request) => {
  const testPath = context.testPath;
  if (testPath === undefined || !testPath.endsWith(glueSuffix)) {
    throw new Error("goldenBrowserCheck must be called from a *.golden.browser.test.ts file");
  }
  const root = resolve(context.project.config.root);
  const relativePath = relative(root, resolve(testPath)).split(sep).join("/");
  if (!/^packages\/[^/]+\/test\/[^/]+\.golden\.browser\.test\.ts$/.test(relativePath)) {
    throw new Error(`golden browser test ${relativePath} is outside packages/*/test/`);
  }
  if (request.pngBase64.length > maxBase64Length) throw new Error("browser PNG is too large");

  const suiteFile = resolve(root, relativePath.slice(0, -glueSuffix.length) + ".golden.ts");
  const node = context.project.vitest.getProjectByName("node");
  const loaded = await node.import<{ default: GoldenSuite<unknown> }>(suiteFile);
  const suite = loaded.default;
  const fixture = suite.fixtures.find((candidate) => candidate.name === request.fixture);
  if (fixture === undefined)
    throw new Error(`golden suite ${suite.name} has no fixture ${request.fixture}`);

  const nodeSvg = await suite.render(fixture.input);
  return checkBrowserRender(suite, fixture, GoldenStore.forSuiteFile(suiteFile), nodeSvg, {
    svg: request.svg,
    png: Buffer.from(request.pngBase64, "base64"),
  });
};
