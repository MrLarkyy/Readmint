# Wiki publishing

The user guide on the GitHub wiki (`https://github.com/MrLarkyy/Readmint/wiki`) is generated from `docs/`; the
repository stays the single source of truth, and the wiki's own git repository (`Readmint.wiki.git`) holds only the
generated pages. Edit `docs/`, never the wiki: the next publish overwrites it.

## What is published

`packages/wiki/src/wikiPages.ts` lists every published page: its `docs/` file, its wiki name (the URL), its title, its
group and a one-line summary. The groups, in reading order, are _Start here_, _Guides_, _Reference_ and _Contributors_;
the contributor pages ([Golden tests](golden-tests.md) and this page) are published too, in their own group, so the
user guide stays free of them. A new doc is added to the list; a test fails when a `docs/` file is not listed, when a
listed file is missing, or when the first heading of a file differs from its title in the list.

The generator (`buildWiki`, no I/O) writes one page per listed doc and three generated files:

- `Home.md`: the introduction, a link to the examples repository, a numbered _Reading route_ with one line per group
  and its first page, then every group with its pages and summaries;
- `_Sidebar.md`: _Home_ and every group heading with its pages, in list order;
- `_Footer.md`: _Home_, _Getting started_, the examples repository and the source folder, on every page.

It rewrites relative links between docs to wiki page names (anchors kept), adds a "generated from docs/…, edit there"
banner and leaves fenced and inline code alone. The output depends on the inputs only.

A wiki page name is its URL: it never changes with a title. When a page has to be renamed, the old name stays as a
short page that links to the new one, and the rename is recorded here. No page has been renamed yet; the pages
_Golden-tests_ and _Wiki-publishing_ are new in the wiki (they were repository-only before).

## Links are checked

`pnpm test` checks every relative link and anchor in `docs/*.md` and the root `README.md` against the files and
headings that exist, and every link of the generated pages against the generated page set, so a moved page or a
renamed heading fails a test rather than a reader.

## Publishing

- **CI**: the `Publish wiki` workflow runs on a push to `main` that touches `docs/` or `packages/wiki/`, and on demand (a run on any other branch does nothing: the wiki always comes from `main`). It
  runs the generator test, builds the pages and commits them to the wiki repository with the workflow's `GITHUB_TOKEN`
  (`contents: write`; the job checks out `<repository>.wiki`). Nothing is committed when the pages are unchanged.
- **Manually**: `pnpm wiki` writes the pages to `.wiki-out/` (not committed). Clone `Readmint.wiki.git`, replace its `*.md`
  files with those, commit and push.

The first publish is the repository owner's step: the wiki must be enabled and have its initial page (it has), and the
first run of the workflow is started by hand with _Run workflow_.
