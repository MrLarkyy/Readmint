/** The locales a design may declare; the same tags as the `@readmint/expr` tables (a renderer test pins both lists equal). */
export const designLocales = Object.freeze(["en", "de", "fr", "es", "cs"] as const);

export type DesignLocale = (typeof designLocales)[number];
