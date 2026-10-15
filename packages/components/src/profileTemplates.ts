/**
 * The full-profile templates, each a folder `@readmint/components/templates/profiles/<name>/` of designs in the public
 * format: one design per README section plus its `.dark` twin, an example `README.md` and the `fonts/` they name
 * (docs/components.md). The sections are listed in README order.
 */
export const profileTemplates = Object.freeze({
  "year-ring": Object.freeze([
    "header",
    "year",
    "index",
    "recent",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "footer",
  ] as const),
  horizon: Object.freeze([
    "header",
    "year",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "stack",
    "footer",
  ] as const),
  pinscreen: Object.freeze([
    "header",
    "year",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "log",
    "stack",
    "footer",
  ] as const),
});

export type ProfileTemplate = keyof typeof profileTemplates;
export type ProfileSection = (typeof profileTemplates)[ProfileTemplate][number];
