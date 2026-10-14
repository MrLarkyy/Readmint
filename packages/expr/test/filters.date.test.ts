import { describe, expect, test } from "vitest";
import { civilFromDays, daysFromCivil } from "../src/civilDays.js";
import { maxDateMs, minDateMs, parseDate } from "../src/parseDate.js";
import { errorOf, valueOf } from "./evaluateText.js";

const nbsp = " ";

function date(input: string | number, args = "", locale = "en"): unknown {
  return valueOf(`{{ d | date(${args}) }}`, { d: input }, { locale });
}

describe("parseDate", () => {
  test.each([
    ["2024-01-05", Date.UTC(2024, 0, 5)],
    ["2024-02-29", Date.UTC(2024, 1, 29)],
    ["2024-01-05T10:20", Date.UTC(2024, 0, 5, 10, 20)],
    ["2024-01-05T10:20:30", Date.UTC(2024, 0, 5, 10, 20, 30)],
    ["2024-01-05T10:20:30Z", Date.UTC(2024, 0, 5, 10, 20, 30)],
    ["2024-01-05T10:20:30.123Z", Date.UTC(2024, 0, 5, 10, 20, 30, 123)],
    ["2024-01-05T10:20:30.1Z", Date.UTC(2024, 0, 5, 10, 20, 30, 100)],
    ["2024-01-05T10:20:30.123456789Z", Date.UTC(2024, 0, 5, 10, 20, 30, 123)],
    ["2024-01-05T10:20+02:00", Date.UTC(2024, 0, 5, 8, 20)],
    ["2024-01-05T01:00:00-05:30", Date.UTC(2024, 0, 5, 6, 30)],
    ["2024-01-01T00:30+01:00", Date.UTC(2023, 11, 31, 23, 30)],
    ["0000-01-01", minDateMs],
    ["9999-12-31T23:59:59.999Z", maxDateMs],
  ])("reads %s in UTC", (text, expected) => {
    expect(parseDate(text)).toBe(expected);
  });

  test.each([
    "2023-02-29",
    "1900-02-29",
    "2024-13-01",
    "2024-00-10",
    "2024-04-31",
    "2024-01-00",
    "2024-1-05",
    "24-01-05",
    "+002024-01-05",
    "2024-01-05T24:00",
    "2024-01-05T10:60",
    "2024-01-05T10:20:60",
    "2024-01-05T10",
    "2024-01-05T10:20:30.",
    "2024-01-05T10:20:30.1234567890Z",
    "2024-01-05T10:20+0200",
    "2024-01-05T10:20+24:00",
    "2024-01-05 10:20",
    "2024-01-05t10:20",
    "2024-01-05Z",
    "2024-01-05T10:20Zjunk",
    "Jan 5, 2024",
    "0000-01-01T00:30+01:00",
    "9999-12-31T23:30-01:00",
    "",
    " 2024-01-05",
  ])("refuses %j", (text) => {
    expect(parseDate(text)).toBeUndefined();
  });

  test("epoch milliseconds: integers within the years 0000 to 9999", () => {
    expect(parseDate(0)).toBe(0);
    expect(parseDate(1.5)).toBeUndefined();
    expect(parseDate(minDateMs - 1)).toBeUndefined();
    expect(parseDate(maxDateMs + 1)).toBeUndefined();
    expect(parseDate(true)).toBeUndefined();
  });

  test("calendar arithmetic matches Date.UTC across the whole range", () => {
    for (let year = 0; year <= 9999; year += 37) {
      for (const [month, day] of [
        [1, 1],
        [2, 28],
        [3, 1],
        [12, 31],
      ] as const) {
        const days = daysFromCivil(year, month, day);
        const reference = new Date(0);
        reference.setUTCFullYear(year, month - 1, day);
        expect(days * 86_400_000).toBe(Math.floor(reference.getTime() / 86_400_000) * 86_400_000);
        expect(civilFromDays(days)).toEqual({ year, month, day });
      }
    }
  });
});

describe("date", () => {
  const moment = "2024-03-05T14:07:09Z";

  test.each([
    ["en", "Mar 5, 2024"],
    ["de", "05.03.2024"],
    ["fr", "5 mars 2024"],
    ["es", "5 mar 2024"],
    ["cs", "5. 3. 2024"],
  ])("uses the %s default pattern", (locale, expected) => {
    expect(date(moment, "", locale)).toBe(expected);
  });

  test.each([
    ["yyyy-MM-dd", "2024-03-05"],
    ["yy", "24"],
    ["M/d", "3/5"],
    ["MMM MMMM", "Mar March"],
    ["EEE EEEE", "Tue Tuesday"],
    ["H:mm:ss", "14:07:09"],
    ["HH m s", "14 7 9"],
    ["h:mm a", "2:07 PM"],
    ["hh a", "02 PM"],
    ["'week' d", "week 5"],
    ["d 'o''clock' ''", "5 o'clock '"],
    ["yyyy年M月d日", "2024年3月5日"],
  ])("pattern %s gives %s", (pattern, expected) => {
    expect(date(moment, `'${pattern.replaceAll("'", "\\'")}'`)).toBe(expected);
  });

  test("midnight and noon on the 12-hour clock", () => {
    expect(date("2024-03-05T00:15Z", "'h:mm a'")).toBe("12:15 AM");
    expect(date("2024-03-05T12:15Z", "'h:mm a'")).toBe("12:15 PM");
  });

  test("a locale argument overrides the scope locale; null keeps the default pattern", () => {
    expect(date(moment, "'EEEE d. MMMM', 'de'")).toBe("Dienstag 5. März");
    expect(date(moment, "null, 'cs'")).toBe("5. 3. 2024");
    expect(date(moment, "'h a', 'es'")).toBe(`2 p.${nbsp}m.`);
    expect(date(moment, "'a', 'cs'")).toBe("odp.");
    expect(date(moment, "'EEE d MMM', 'de-AT'")).toBe("Di. 5 März");
  });

  test("an offset moves the date in UTC; a date alone is UTC midnight", () => {
    expect(date("2024-03-05T00:30+01:00", "'yyyy-MM-dd HH:mm'")).toBe("2024-03-04 23:30");
    expect(date("2024-03-05", "'yyyy-MM-dd HH:mm'")).toBe("2024-03-05 00:00");
  });

  test("leap day, the first and the last supported day", () => {
    expect(date("2024-02-29", "'EEEE d MMMM yyyy'")).toBe("Thursday 29 February 2024");
    expect(date("0000-01-01", "'yyyy-MM-dd EEE'")).toBe("0000-01-01 Sat");
    expect(date("9999-12-31", "'yyyy-MM-dd EEE'")).toBe("9999-12-31 Fri");
    expect(date(0, "'yyyy-MM-dd HH:mm EEE'")).toBe("1970-01-01 00:00 Thu");
  });

  test.each([
    ["{{ '2023-02-29' | date }}", "invalid-date"],
    ["{{ 'yesterday' | date }}", "invalid-date"],
    ["{{ 1.5 | date }}", "invalid-date"],
    ["{{ true | date }}", "type"],
    ["{{ [] | date }}", "type"],
    ["{{ 0 | date('yyy') }}", "argument"],
    ["{{ 0 | date('Q') }}", "argument"],
    ["{{ 0 | date('dd ddd') }}", "argument"],
    ["{{ 0 | date('EE') }}", "argument"],
    ['{{ 0 | date("\'open") }}', "argument"],
    ["{{ 0 | date(5) }}", "argument"],
    ["{{ 0 | date('d', 'xx') }}", "unknown-locale"],
    ["{{ 0 | date('d', 1) }}", "argument"],
  ])("%s fails with %s", (text, code) => {
    expect(errorOf(text).code).toBe(code);
  });

  test("a pattern over 64 characters is refused", () => {
    expect(errorOf(`{{ 0 | date('${"d".repeat(1)}${" ".repeat(64)}') }}`).code).toBe("argument");
    expect(date(0, `'d${" ".repeat(63)}'`)).toBe(`1${" ".repeat(63)}`);
  });

  test("null passes through", () => {
    expect(valueOf("{{ null | date }}")).toBeNull();
  });
});
