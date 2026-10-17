import { describe, expect, test } from "vitest";
import { loadFeedData } from "../src/index.js";
import { fixture, stubFetch, xml } from "./stubFetch.js";

const load = (url: string, body: string) =>
  loadFeedData({
    url,
    fetch: stubFetch(() => xml(body, { "content-type": "application/atom+xml" })).fetch,
  });

describe("Atom 1.0", () => {
  test("release notes: html, xhtml and text constructs, relative and unsafe links", async () => {
    const { data } = await load(
      "https://code.example/owner/repo/releases.atom",
      fixture("releases.atom.xml"),
    );
    expect(data).toEqual({
      version: 0,
      title: "Release notes from repo",
      link: "https://code.example/owner/repo/releases",
      entries: [
        {
          title: "v1.2.0",
          link: "https://code.example/owner/repo/releases/tag/v1.2.0",
          published: "2026-10-15T10:00:00.000Z",
          summary: "Features Feed source Faster & smaller",
        },
        {
          title: "v1.1.0 stable",
          link: "https://code.example/owner/repo/releases/tag/v1.1.0",
          published: "2026-09-01T06:00:00.000Z",
          summary: "Bug fixes. Docs.",
        },
        {
          title: "Old <b> pre-release",
          link: "",
          published: "2026-08-01T00:00:00.000Z",
          summary: "Text summary with <tags> kept as text.",
        },
      ],
    });
  });

  test("a video channel with media: and yt: extensions reads the Atom parts only", async () => {
    const { data } = await load(
      "https://videos.example/feeds/videos.xml?channel_id=UC123",
      fixture("videos.atom.xml"),
    );
    expect(data).toEqual({
      version: 0,
      title: "Mint Videos",
      link: "https://videos.example/channel/UC123",
      entries: [
        {
          title: "Animating with SMIL",
          link: "https://videos.example/watch?v=def",
          published: "2026-10-12T17:00:00.250Z",
          summary: "",
        },
        {
          title: "Designing a README card",
          link: "https://videos.example/watch?v=abc",
          published: "2026-10-10T17:00:05.000Z",
          summary: "",
        },
      ],
    });
  });

  test("content given by src or as another media type has no summary", async () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>a</title><content src="https://x.example/a"/></entry>
      <entry><title>b</title><content type="application/json">{"a":1}</content></entry>
      <entry><title>c</title><content type="text">inline</content></entry>
    </feed>`;
    const { data } = await load("https://x.example/feed", atom);
    expect(data.entries.map((entry) => entry.summary)).toEqual(["", "", "inline"]);
  });

  test("a feed element outside the Atom namespace is not Atom", async () => {
    const result = load("https://x.example/feed", "<feed><entry/></feed>");
    await expect(result).rejects.toMatchObject({ code: "invalid-response" });
  });
});
