import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { fetchBoundImages, RemoteImageError } from "../src/index.js";

/**
 * A remote image `src` is evaluated before any render, without the renderer's text measurer: `textWidth` and
 * `truncateWidth` there are a clear `image-binding` refusal naming why, and nothing is fetched.
 */
test.each([
  '{{ "https://avatars.githubusercontent.com/u/" + (github.login | textWidth("f", 16)) }}',
  '{{ github.avatarUrl | truncateWidth(100, "f", 16) }}',
])("a measuring filter in a remote image src (%s) is refused before fetching", async (src) => {
  const design = {
    version: 0,
    canvas: { width: 10, height: 10 },
    assets: { images: { avatar: { src } } },
    layers: [{ type: "image", asset: "avatar", width: 8, height: 8 }],
  } as Design;
  const calls: string[] = [];
  const error = await fetchBoundImages(
    design,
    { github: { login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4" } },
    {
      fetch: (url) => {
        calls.push(url);
        return Promise.reject(new Error("no fetch expected"));
      },
      cache: new Map(),
    },
  ).then(
    () => expect.fail("expected a refusal"),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RemoteImageError);
  expect(error).toMatchObject({ code: "image-binding", asset: "avatar" });
  expect((error as RemoteImageError).message).toMatch(
    /measures text as drawn and needs a renderer/u,
  );
  expect(calls).toEqual([]);
});
