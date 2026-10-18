/**
 * The full-profile templates, each a folder `@readmint/components/templates/profiles/<name>/` of designs in the public
 * format: one design per distinct section, a `renders.json` render manifest naming the renders (the six repository
 * cards are one `repo.json` with a slot each; the dark look is the manifest's `dark` variant), an example `README.md`
 * and the `fonts/` they name (docs/components.md). The sections are the render names, listed in README order.
 */
export const profileTemplates = Object.freeze({
  "year-ring": Object.freeze([
    "header",
    "year",
    "index",
    "recent",
    "work",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "repo-5",
    "repo-6",
    "footer",
  ] as const),
  horizon: Object.freeze([
    "header",
    "ticker",
    "year",
    "work",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "repo-5",
    "repo-6",
    "stack",
    "worked",
    "footer",
  ] as const),
  pinscreen: Object.freeze([
    "header",
    "year",
    "work",
    "repo-1",
    "repo-2",
    "repo-3",
    "repo-4",
    "repo-5",
    "repo-6",
    "log",
    "stack",
    "footer",
  ] as const),
});

export type ProfileTemplate = keyof typeof profileTemplates;
export type ProfileSection = (typeof profileTemplates)[ProfileTemplate][number];
