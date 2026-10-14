/*
 * Locale tables for the number and date filters.
 *
 * Source: Unicode CLDR 48 (common/main/en.xml, de.xml, fr.xml, es.xml, cs.xml): decimal and group
 * symbols, minimumGroupingDigits, the percent pattern, format-context wide and abbreviated month
 * and weekday names, abbreviated day periods and the medium date pattern, checked against ICU 78.3.
 * The compact suffixes are Readmint's own values (based on the CLDR short decimal formats, with a
 * German thousands suffix and a Spanish billions suffix CLDR does not have), see docs/expressions.md.
 *
 * UNICODE LICENSE V3
 *
 * COPYRIGHT AND PERMISSION NOTICE
 *
 * Copyright © 1991-2025 Unicode, Inc.
 *
 * NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING, INSTALLING, COPYING
 * OR OTHERWISE USING DATA FILES, AND/OR SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY,
 * ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL,
 * COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of data files and any
 * associated documentation (the "Data Files") or software and any associated documentation (the
 * "Software") to deal in the Data Files or Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, and/or sell copies of the
 * Data Files or Software, and to permit persons to whom the Data Files or Software are furnished to
 * do so, provided that either (a) this copyright and permission notice appear with all copies of the
 * Data Files or Software, or (b) this copyright and permission notice appear in associated
 * Documentation.
 *
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS.
 *
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM,
 * OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF
 * USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 * ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.
 *
 * Except as contained in this notice, the name of a copyright holder shall not be used in
 * advertising or otherwise to promote the sale, use or other dealings in these Data Files or
 * Software without prior written authorization of the copyright holder.
 */
import type { LocaleData } from "./LocaleData.js";

/** U+00A0 NO-BREAK SPACE. */
const nbsp = "\u00a0";
/** U+202F NARROW NO-BREAK SPACE. */
const narrowNbsp = "\u202f";

const en: LocaleData = {
  tag: "en",
  decimal: ".",
  group: ",",
  minimumGroupingDigits: 1,
  percentSuffix: "%",
  compactSuffixes: ["K", "M", "B", "T"],
  monthsLong: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  dayPeriods: ["AM", "PM"],
  datePattern: "MMM d, yyyy",
};

const de: LocaleData = {
  tag: "de",
  decimal: ",",
  group: ".",
  minimumGroupingDigits: 1,
  percentSuffix: `${nbsp}%`,
  compactSuffixes: [`${nbsp}Tsd.`, `${nbsp}Mio.`, `${nbsp}Mrd.`, `${nbsp}Bio.`],
  monthsLong: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
  monthsShort: [
    "Jan.",
    "Feb.",
    "März",
    "Apr.",
    "Mai",
    "Juni",
    "Juli",
    "Aug.",
    "Sept.",
    "Okt.",
    "Nov.",
    "Dez.",
  ],
  weekdaysLong: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  weekdaysShort: ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."],
  dayPeriods: ["AM", "PM"],
  datePattern: "dd.MM.yyyy",
};

const fr: LocaleData = {
  tag: "fr",
  decimal: ",",
  group: narrowNbsp,
  minimumGroupingDigits: 1,
  percentSuffix: `${nbsp}%`,
  compactSuffixes: [`${nbsp}k`, `${nbsp}M`, `${nbsp}Md`, `${nbsp}Bn`],
  monthsLong: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
  monthsShort: [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ],
  weekdaysLong: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  weekdaysShort: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  dayPeriods: ["AM", "PM"],
  datePattern: "d MMM yyyy",
};

const es: LocaleData = {
  tag: "es",
  decimal: ",",
  group: ".",
  minimumGroupingDigits: 2,
  percentSuffix: `${nbsp}%`,
  compactSuffixes: [`${nbsp}mil`, `${nbsp}M`, `${nbsp}mil${nbsp}M`, `${nbsp}B`],
  monthsLong: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  monthsShort: [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sept",
    "oct",
    "nov",
    "dic",
  ],
  weekdaysLong: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  weekdaysShort: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  dayPeriods: [`a.${narrowNbsp}m.`, `p.${narrowNbsp}m.`],
  datePattern: "d MMM yyyy",
};

const cs: LocaleData = {
  tag: "cs",
  decimal: ",",
  group: nbsp,
  minimumGroupingDigits: 1,
  percentSuffix: `${nbsp}%`,
  compactSuffixes: [`${nbsp}tis.`, `${nbsp}mil.`, `${nbsp}mld.`, `${nbsp}bil.`],
  monthsLong: [
    "ledna",
    "února",
    "března",
    "dubna",
    "května",
    "června",
    "července",
    "srpna",
    "září",
    "října",
    "listopadu",
    "prosince",
  ],
  monthsShort: ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"],
  weekdaysLong: ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"],
  weekdaysShort: ["ne", "po", "út", "st", "čt", "pá", "so"],
  dayPeriods: ["dop.", "odp."],
  datePattern: "d. M. yyyy",
};

function freezeTable(table: LocaleData): LocaleData {
  Object.freeze(table.compactSuffixes);
  Object.freeze(table.monthsLong);
  Object.freeze(table.monthsShort);
  Object.freeze(table.weekdaysLong);
  Object.freeze(table.weekdaysShort);
  Object.freeze(table.dayPeriods);
  return Object.freeze(table);
}

/** Every supported locale by canonical tag. */
export const locales: ReadonlyMap<string, LocaleData> = new Map(
  [en, de, fr, es, cs].map((table) => [table.tag, freezeTable(table)]),
);

/** Longest BCP 47 tag worth looking up; longer input is unknown without being lowercased. */
const maxTagLength = 35;

/** The table for `tag` (case-insensitive): the whole tag, else its language subtag (`de-AT` -> `de`). */
export function resolveLocale(tag: string): LocaleData | undefined {
  if (tag.length === 0 || tag.length > maxTagLength) return undefined;
  const lower = tag.toLowerCase();
  const exact = locales.get(lower);
  if (exact !== undefined) return exact;
  const dash = lower.indexOf("-");
  return dash > 0 ? locales.get(lower.slice(0, dash)) : undefined;
}
