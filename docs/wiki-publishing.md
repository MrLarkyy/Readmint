# Wiki publishing

The user guide on the GitHub wiki (`https://github.com/MrLarkyy/Readmint/wiki`) is generated from `docs/`; the
repository stays the single source of truth, and the wiki's own git repository (`Readmint.wiki.git`) holds only the
generated pages. Edit `docs/`, never the wiki: the next publish overwrites it.

## What is published

`packages/wiki/src/wikiPages.ts` lists the published pages, in sidebar order, with their wiki names. A file in `docs/`
that is not listed there is contributor documentation (`golden-tests.md`, this file) and gets no wiki page; a link to
it from a published page becomes a link to the file in the repository. A new user-facing doc is added to the list; a
test fails when a `docs/` file is neither listed nor expected to be contributor-only.

The generator (`buildWiki`, no I/O) writes `Home.md` (getting started with the Action workflow copied from
`docs/action.md`, plus the page index), `_Sidebar.md` and one page per listed doc. It rewrites relative links between
docs to wiki page names (anchors kept), adds a "generated from docs/…, edit there" banner and leaves fenced and inline
code alone. The output depends on the inputs only. The test checks that every link and anchor resolves.

## Publishing

- **CI**: the `Publish wiki` workflow runs on a push to `main` that touches `docs/` or `packages/wiki/`, and on demand (a run on any other branch does nothing: the wiki always comes from `main`). It
  runs the generator test, builds the pages and commits them to the wiki repository with the workflow's `GITHUB_TOKEN`
  (`contents: write`; the job checks out `<repository>.wiki`). Nothing is committed when the pages are unchanged.
- **Manually**: `pnpm wiki` writes the pages to `.wiki-out/` (not committed). Clone `Readmint.wiki.git`, replace its `*.md`
  files with those, commit and push.

The first publish is the repository owner's step: the wiki must be enabled and have its initial page (it has), and the
first run of the workflow is started by hand with _Run workflow_.
