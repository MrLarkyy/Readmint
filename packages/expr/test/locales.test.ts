import { describe, expect, test } from "vitest";
import { locales, resolveLocale } from "../src/locales.js";
import { errorOf, valueOf } from "./evaluateText.js";

const nbsp = "\u00a0";
const nnbsp = "\u202f";

/** Every value of every table, pinned: CLDR 48 for the symbols and names, own compact suffixes. */
const expected = {
  en: {
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
    monthsShort: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    dayPeriods: ["AM", "PM"],
    datePattern: "MMM d, yyyy",
  },
  de: {
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
  },
  fr: {
    tag: "fr",
    decimal: ",",
    group: nnbsp,
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
  },
  es: {
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
    dayPeriods: [`a.${nnbsp}m.`, `p.${nnbsp}m.`],
    datePattern: "d MMM yyyy",
  },
  cs: {
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
    monthsShort: [
      "led",
      "úno",
      "bře",
      "dub",
      "kvě",
      "čvn",
      "čvc",
      "srp",
      "zář",
      "říj",
      "lis",
      "pro",
    ],
    weekdaysLong: ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"],
    weekdaysShort: ["ne", "po", "út", "st", "čt", "pá", "so"],
    dayPeriods: ["dop.", "odp."],
    datePattern: "d. M. yyyy",
  },
};

describe("locale tables", () => {
  test("hold exactly en, de, fr, es and cs", () => {
    expect([...locales.keys()]).toEqual(["en", "de", "fr", "es", "cs"]);
  });

  test.each(Object.entries(expected))("pins every value of %s", (tag, table) => {
    expect(locales.get(tag)).toEqual(table);
  });

  test("are frozen", () => {
    for (const table of locales.values()) {
      expect(Object.isFrozen(table)).toBe(true);
      expect(Object.isFrozen(table.monthsLong)).toBe(true);
      expect(Object.isFrozen(table.compactSuffixes)).toBe(true);
    }
  });

  test.each([
    ["en", "en"],
    ["EN", "en"],
    ["en-US", "en"],
    ["de-AT", "de"],
    ["de-CH-1996", "de"],
    ["fr-CA", "fr"],
    ["es-419", "es"],
    ["cs-CZ", "cs"],
  ])("resolves %s to %s", (tag, table) => {
    expect(resolveLocale(tag)?.tag).toBe(table);
  });

  test.each(["", "xx", "de_AT", "-de", "e", "english", "x".repeat(36)])(
    "does not resolve %j",
    (tag) => {
      expect(resolveLocale(tag)).toBeUndefined();
    },
  );

  test("the scope locale is the default, en without one", () => {
    expect(valueOf("{{ 1234.5 | number(1) }}")).toBe("1,234.5");
    expect(valueOf("{{ 1234.5 | number(1) }}", {}, { locale: "de-AT" })).toBe("1.234,5");
    expect(errorOf("{{ 1 | number }}", {}, { locale: "tlh" }).code).toBe("unknown-locale");
    expect(valueOf("{{ 1 | round }}", {}, { locale: "tlh" })).toBe(1);
  });
});
