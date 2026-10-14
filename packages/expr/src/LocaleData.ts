/** What the number and date filters need of a locale; all values fixed, never taken from `Intl`. */
export interface LocaleData {
  /** Canonical tag, lower case: `en`, `de`, ... */
  readonly tag: string;
  readonly decimal: string;
  readonly group: string;
  /** Integer digits needed beyond three before the group separator is used (CLDR minimumGroupingDigits). */
  readonly minimumGroupingDigits: number;
  /** Written after a percentage, separator included. */
  readonly percentSuffix: string;
  /** Written after a compacted number for thousands, millions, billions and trillions, separator included. */
  readonly compactSuffixes: readonly [string, string, string, string];
  /** January first. */
  readonly monthsLong: readonly string[];
  readonly monthsShort: readonly string[];
  /** Sunday first. */
  readonly weekdaysLong: readonly string[];
  readonly weekdaysShort: readonly string[];
  /** Before noon, after noon. */
  readonly dayPeriods: readonly [string, string];
  /** Pattern of `date` without a pattern argument. */
  readonly datePattern: string;
}
