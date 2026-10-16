import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

const fixtures = join(import.meta.dirname, "..", "..", "data-feed", "test", "fixtures");
const BLOG = readFileSync(join(fixtures, "blog.rss.xml"), "utf8");
const RELEASES = readFileSync(join(fixtures, "releases.atom.xml"), "utf8");
const BLOG_URL = "https://blog.example/feed.xml";
const RELEASES_URL = "https://code.example/owner/repo/releases.atom";
const font = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "components",
    "templates",
    "fonts",
    "Montserrat-Medium.ttf",
  ),
);

/** A design with one text layer showing `content`. */
function textDesign(content: string): object {
  return {
    version: 0,
    canvas: { width: 600, height: 40, background: "#ffffff" },
    assets: {
      fonts: {
        body: {
          family: "Montserrat",
          src: "Montserrat-Medium.ttf",
          weight: 500,
          licence: { embedding: "allowed", name: "OFL-1.1" },
        },
      },
    },
    layers: [{ type: "text", x: 4, y: 24, content, font: "body" }],
  };
}

function serving(feeds: Record<string, string>, requests: string[] = []): ImageFetch {
  return (url) => {
    requests.push(url);
    const body = feeds[url];
    return Promise.resolve(
      body === undefined
        ? new Response("", { status: 404 })
        : new Response(body, { headers: { "content-type": "application/xml" } }),
    );
  };
}

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("Montserrat-Medium.ttf", font);
});

afterEach(async () => {
  await tree.remove();
});

async function render(content: string, args: readonly string[], fetch = serving({})) {
  await tree.file("design.json", textDesign(content));
  return tree.run(["render", "design.json", ...args], { fetch });
}

describe("--data-feed", () => {
  test("an RSS feed binds under its namespace, byte-identical on every run", async () => {
    const requests: string[] = [];
    const fetch = serving({ [BLOG_URL]: BLOG }, requests);
    const args = ["--data-feed", `blog=${BLOG_URL}`];
    const content = "{{ blog.title }}: {{ blog.entries[0].title }}";
    const first = await render(content, args, fetch);
    const second = await render(content, args, fetch);
    expect(first.stderr).toBe("");
    expect(first.code).toBe(ExitCode.ok);
    expect(first.stdout).toContain("Mint &amp; Notes: Shipping the feed source");
    expect(second.stdout).toBe(first.stdout);
    expect(requests).toEqual([BLOG_URL, BLOG_URL]);
  });

  test("an Atom feed binds the same way; markup in its text stays text", async () => {
    const run = await render(
      "{{ releases.entries[2].title }}",
      ["--data-feed", `releases=${RELEASES_URL}`],
      serving({ [RELEASES_URL]: RELEASES }),
    );
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("Old &lt;b&gt; pre-release");
    expect(run.stdout).not.toContain("<b>");
  });

  test("without ns= the feed binds under feed; published formats with date", async () => {
    const run = await render(
      '{{ feed.entries[0].published | date("d MMM yyyy") }}',
      ["--data-feed", BLOG_URL],
      serving({ [BLOG_URL]: BLOG }),
    );
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("16 Oct 2026");
  });

  test("a null published passes date as null: empty text, or the default given", async () => {
    const undated = '<rss version="2.0"><channel><item><title>x</title></item></channel></rss>';
    const fetch = serving({ [BLOG_URL]: undated });
    const direct = await render(
      "[{{ feed.entries[0].published | date }}]",
      ["--data-feed", BLOG_URL],
      fetch,
    );
    expect(direct.code).toBe(ExitCode.ok);
    expect(direct.stdout).toContain("[]");
    const fallback = await render(
      '{{ feed.entries[0].published | date("d MMM") | default("undated") }}',
      ["--data-feed", BLOG_URL],
      fetch,
    );
    expect(fallback.code).toBe(ExitCode.ok);
    expect(fallback.stdout).toContain("undated");
  });

  test("--data-feed-limit keeps that many entries", async () => {
    const fetch = serving({ [BLOG_URL]: BLOG });
    const all = await render(
      "n={{ blog.entries | length }}",
      ["--data-feed", `blog=${BLOG_URL}`],
      fetch,
    );
    const one = await render(
      "n={{ blog.entries | length }}",
      ["--data-feed", `blog=${BLOG_URL}`, "--data-feed-limit", "blog=1"],
      fetch,
    );
    expect(all.stdout).toContain("n=3");
    expect(one.stdout).toContain("n=1");
  });

  test("a feed that cannot load is exit code 4 with the feed data line, never the URL", async () => {
    const url = "https://blog.example/missing.xml?key=s3cr3t";
    const run = await render("{{ feed.title }}", ["--data-feed", url]);
    expect(run.code).toBe(ExitCode.data);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("Feed data feed (not-found): The feed URL answered HTTP 404.\n");
  });

  test("a hostile feed is exit code 4 without its text", async () => {
    const run = await render(
      "{{ feed.title }}",
      ["--data-feed", BLOG_URL],
      serving({
        [BLOG_URL]: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><rss>&e;</rss>',
      }),
    );
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toMatch(
      /^Feed data feed \(invalid-response\): The feed document has a DOCTYPE/,
    );
    expect(run.stderr).not.toContain("passwd");
  });

  test("adds its namespace after --data-json and to --data", async () => {
    await tree.file("fixture.json", { other: { v: "F" } });
    await tree.file("stats.json", { n: "J" });
    const run = await render(
      "{{ other.v }}{{ stats.document.n }}{{ blog.entries | length }}",
      [
        "--data",
        "fixture.json",
        "--data-json",
        "stats=stats.json",
        "--data-feed",
        `blog=${BLOG_URL}`,
      ],
      serving({ [BLOG_URL]: BLOG }),
    );
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("FJ3");
  });

  test("a fixture key equal to a feed namespace is exit code 3 naming it", async () => {
    await tree.file("fixture.json", { blog: {} });
    const run = await render(
      "{{ blog.title }}",
      ["--data", "fixture.json", "--data-feed", `blog=${BLOG_URL}`],
      serving({ [BLOG_URL]: BLOG }),
    );
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).toContain("data namespace blog");
  });

  test("validate renders with it; a broken design fails before any request", async () => {
    const requests: string[] = [];
    const fetch = serving({ [BLOG_URL]: BLOG }, requests);
    await tree.file("design.json", textDesign("{{ blog.entries[0].summary }}"));
    const ok = await tree.run(["validate", "design.json", "--data-feed", `blog=${BLOG_URL}`], {
      fetch,
    });
    expect(ok.code).toBe(ExitCode.ok);
    await tree.file("broken.json", "{");
    const broken = await tree.run(["render", "broken.json", "--data-feed", `blog=${BLOG_URL}`], {
      fetch,
    });
    expect(broken.code).toBe(ExitCode.invalid);
    expect(requests).toEqual([BLOG_URL]);
  });
});
