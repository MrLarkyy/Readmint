import { isSupportedLocale, supportedLocales } from "@readmint/expr";

/**
 * Why `locale` cannot be the locale override of a render, or `undefined` when it can: it must be
 * a BCP 47 tag the expression tables resolve. The reason follows the quoted value in a message;
 * `--locale` of the CLI and the Action's `locale` input share it.
 */
export function localeProblem(locale: string): string | undefined {
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    return "is not a BCP 47 language tag";
  }
  if (!isSupportedLocale(locale)) {
    return `is not supported (supported: ${supportedLocales.join(", ")})`;
  }
  return undefined;
}
