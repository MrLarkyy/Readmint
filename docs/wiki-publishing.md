# Wiki publishing

The user guide on the GitHub wiki (`https://github.com/MrLarkyy/Readmint/wiki`) is generated from `docs/`; the
repository stays the single source of truth, and the wiki's own git repository (`Readmint.wiki.git`) holds only the
generated pages. Edit `docs/`, never the wiki: the next publish overwrites it.

## What is published

`packages/wiki/src/wikiPages.ts` lists every published page: its `docs/` file, its wiki name (the URL), its title, its
group and a one-line summary. The groups, in reading order, are _See it first_ (the generated Gallery), _Start here_, _Guides_, _Reference_ and _Contributors_;
the contributor pages ([Golden tests](golden-tests.md) and this page) are published too, in their own group, so the
user guide stays free of them. A new doc is added to the list; a test fails when a `docs/` file is not listed, when a
listed file is missing, or when the first heading of a file differs from its title in the list.

The generator (`buildWiki`, no I/O) writes one page per listed doc, the [Gallery](#gallery) with its images, and three
generated files:

- `Gallery.md` and `gallery/*.png`: the template gallery, in a first group of its own, _See it first_ (it has no
  `docs/` file, so it is not in the list above);
- `Home.md`: the introduction, a link to the examples repository, a numbered _Reading route_ with one line per group
  and its first page, then every group with its pages and summaries;
- `_Sidebar.md`: _Home_ and every group heading with its pages, in list order;
- `_Footer.md`: _Home_, _Getting started_, the examples repository and the source folder, on every page.

It rewrites relative links between docs to wiki page names (anchors kept), adds a "generated from docs/…, edit there"
banner and leaves fenced and inline code alone. The output depends on the inputs only.

A wiki page name is its URL: it never changes with a title. When a page has to be renamed, the old name stays as a
short page that links to the new one, and the rename is recorded here. No page has been renamed yet; the pages
_Golden-tests_ and _Wiki-publishing_ are new in the wiki (they were repository-only before), and _Gallery_ is generated, with no `docs/` file.

## Gallery

The _Gallery_ page shows every profile template (Year Ring, Horizon, Pinscreen: every section), every starter
template and the three contribution calendars (heatmap, isometric, dots) in light and dark, with a one-line description and links to the template folder in the examples repository
(the starters and calendars, which have no folder there, link to their design file) and to
[Components and templates](components.md).

- **The list** is `packages/wiki/src/galleryTemplates.ts`. A test compares it with the profile, starter and contribution calendar tables of
  [components.md](components.md) and with the section files in `packages/components/templates/`, so a template or
  section added without a gallery entry (or the reverse) fails `pnpm test`. Another test fails when a golden image of the
  list does not exist.
- **The images** are the golden PNGs the [golden tests](golden-tests.md) pin (`packages/components/test/golden/`,
  `ITEM-light.png` and `ITEM-dark.png`; the calendars are `calendar/NAME.png` for light and `calendar/NAME-dark.png` for dark); nothing is drawn by hand and nothing is fetched. The profile sections have a
  transparent canvas, so each image is flattened on the GitHub page colour of its theme (light `#ffffff`, dark
  `#0d1117`) and reads on any wiki theme.
- **Names and size.** A file is named by the first 16 hex digits of the sha256 of its bytes (`gallery/<hash>.png`), so
  identical images are written once and an unchanged image keeps its URL. The generator fails, naming the file, when a
  golden is missing or over 512 KiB, or when the images together pass 3 MiB (about 2 MB today).
- **Safe by construction.** The page is Markdown with relative image links into the wiki repository: no script, no
  external reference. A PNG is checked before it is decoded: at most 512 KiB, exactly one IHDR, not interlaced, at most 4096 px a side.
- The PNG bytes come from Node's zlib, so the hash names depend on the Node build: a newer Node 22 may rename images.
  That is harmless because `gallery/` is replaced whole; CI publishes, and tests check that two builds are equal, not
  a hash.

## Links are checked

`pnpm test` checks every relative link and anchor in `docs/*.md` and the root `README.md` against the files and
headings that exist, and every link of the generated pages against the generated page set, so a moved page or a
renamed heading fails a test rather than a reader.

READMEs link the user guide with wiki URLs, not `docs/` paths, because a `docs/` link opens the Markdown source on GitHub. `packages/wiki/test/readmeLinks.test.ts` checks every README against the generated pages and their headings, so a renamed page or heading fails the test.

## Publishing

- **CI**: the `Publish wiki` workflow runs on a push to `main` that touches `docs/`, `packages/wiki/` or the golden images (`packages/components/test/golden/`), and on demand (a run on any other branch does nothing: the wiki always comes from `main`). It
  runs the generator test, builds the pages and commits them, with `gallery/`, to the wiki repository with the workflow's `GITHUB_TOKEN`
  (`contents: write`; the job checks out `<repository>.wiki`). Nothing is committed when the pages are unchanged.
- **Manually**: `pnpm wiki` writes the pages and `gallery/` to `.wiki-out/` (not committed). Clone `Readmint.wiki.git`, replace its `*.md`
  files and its whole `gallery/` folder with those (delete the old folder first), commit and push.

The first publish is the repository owner's step: the wiki must be enabled and have its initial page (it has), and the
first run of the workflow is started by hand with _Run workflow_.
