# Expression language v0

Design strings bind to data with `{{ … }}` placeholders: `"Hello, {{ github.name }}"`,
`"{{ stats.commits | compact }}"`, a layer's `if` and `repeat.each`. `@readmint/expr` compiles such a string once and
evaluates it against the data as often as needed. It never runs host code, never reaches a prototype, stays within
fixed step and size limits, and gives the same result in Node and in the browser.

## Placeholders and text

A string is compiled as literal text with placeholders in it.

- A string that is **exactly one placeholder** (`"{{ count }}"`, nothing before or after it, not even a space) is an
  _expression_: it evaluates to the value with its type (number, boolean, string, null, array, object). Use this form
  for numeric, colour and boolean properties, `if` and `repeat.each`.
- **Any other string** (`"{{ a }} x {{ b }}"`, `" {{ a }}"`, `"plain"`) is _text_: it evaluates to a string with each
  placeholder written into it: a number as JavaScript's `String(n)` (`1.5`, `-0` as `0`, `1e+21`), a boolean as `true`
  or `false`, `null` as nothing. An array or an object in text is a `type` error.
- The closing `}}` is found by the scanner, so `}}` inside a string literal (`{{ "}}" }}`) does not end the
  placeholder. A `}}` outside any placeholder is literal text. A literal `{{` is written `{{ "{{" }}`. An unclosed `{{`
  and an empty placeholder are `syntax` errors.
- Results are plain text, **not XML-escaped**: the renderer escapes them where it writes SVG.

## Grammar

| form      | syntax                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| number    | `12`, `1.5`, `2e3`, `1.5E-3` (no leading `.`, no sign: `-1` is unary minus)      |
| string    | `'…'` or `"…"`, escapes `\\` `\'` `\"` `\n` `\t` `\u{1F600}` (1 to 6 hex digits) |
| literal   | `true`, `false`, `null`                                                          |
| array     | `[a, b, c]`                                                                      |
| name      | `[A-Za-z_][A-Za-z0-9_]*`; `-` joins a name only before a letter or `_`           |
| property  | `a.b`, `a["key"]`, `a[0]`, `a[i]`                                                |
| filter    | `value \| name`, `value \| name(arg, …)` (at most 4 arguments)                   |
| operators | `+ - * / %`, `== != < <= > >=`, `&& \|\| !`, `test ? a : b`, `( … )`             |

Precedence from low to high: `|`, `? :`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, unary `! -`, then `.name`
and `[key]`. Binary operators group to the left, `? :` to the right. Parentheses, brackets and filter arguments may
contain pipes: `(name | upper) + "!"`. Nothing else can be called, nothing assigned, and there are no object literals
and no user-defined functions.

The hyphen rule keeps ids usable as names: `props.my-label` and `repo-index` are one name each, `x-1` is `x - 1`.
`a-b` is one name, so a subtraction of two names needs spaces (`a - b`); an unknown hyphenated name says so.

## Semantics

- **Names.** A name is looked up in the locals first (the `repeat` item and index, component `props`), then among the
  own top-level keys of the data. An unknown name is an `unknown-name` error.
- **Missing data is `null`.** A missing property, an index out of range and any property of `null` read as `null`, so
  `{{ github.repo.owner.name }}` on partial data is `null`, not an error. Arrays have only integer indices (`list[0]`;
  `list.length` is `null`, use `| length`), and strings, numbers and booleans have no properties.
- **Only data is read.** A read takes an own data property of a plain object (prototype `Object.prototype` or `null`)
  or an item of an array. `__proto__`, `constructor`, `toString` and every other inherited member read as `null`;
  a getter is never invoked. A value that is not JSON (a function, class instance, `Map`, `Date`, getter, `undefined`,
  `NaN`, `Infinity`) is an `invalid-data` error where it is read. Data must be plain JSON values (a `Proxy` is the
  caller's own code and is not detected).
- **Arithmetic.** `+` adds two numbers or joins two strings; `- * / %` take numbers. Any other mix is a `type` error,
  a result that is not finite (`1 / 0`) is `not-finite`.
- **Comparison.** `==` and `!=` compare strings, numbers, booleans and `null` strictly (`1 == "1"` is false); anything
  may be compared with `null`, but two arrays or objects are a `type` error. `< <= > >=` compare two numbers or two
  strings (by UTF-16 code unit).
- **Truthiness.** `false`, `null`, `0`, `""` and the empty array are falsy, everything else truthy (also `{}` and
  `"0"`). `!` gives a boolean; `a && b` and `a || b` give one of their operands (`name || "anonymous"`) and skip the
  other side.
- **Filters** receive the value on their left. Every filter except `default` passes `null` through unchanged, so
  `{{ user.nickname | upper | default("-") }}` is `-` when `user` has no `nickname` (an unknown root name such as
  `{{ nickname }}` stays an `unknown-name` error).

## Filters

| filter                         | input                 | result                                                                               |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| `number(decimals=0, locale?)`  | number                | `1,234.5` with the locale's separators; `decimals` 0 to 20                           |
| `compact(decimals=1, locale?)` | number                | `1.2K`, `3.4M`, `1B`, `2T`; trailing zeros dropped, `999950` is `1M`                 |
| `percent(decimals=0, locale?)` | number                | `0.25` is `25%` (`25 %` in de, fr, es, cs)                                           |
| `round(decimals=0)`            | number                | a number, rounded half away from zero (`2.5` is `3`, `-2.5` is `-3`)                 |
| `floor`                        | number                | the next integer down                                                                |
| `ceil`                         | number                | the next integer up                                                                  |
| `abs`                          | number                | the absolute value                                                                   |
| `min(b)`                       | number                | the smaller of the value and `b`                                                     |
| `max(b)`                       | number                | the larger of the value and `b`                                                      |
| `clamp(low, high)`             | number                | the value within `[low, high]`; `low > high` is an `argument` error                  |
| `date(pattern?, locale?)`      | ISO 8601 string or ms | the date in UTC written with `pattern`, else the locale's default pattern            |
| `upper`                        | string                | upper case by a fixed 1:1 table (see Determinism)                                    |
| `lower`                        | string                | lower case by a fixed 1:1 table (see Determinism)                                    |
| `trim`                         | string                | without leading and trailing white space (a fixed set, see Determinism)              |
| `truncate(length, suffix="…")` | string                | at most `length` code points, the suffix included when it was cut                    |
| `padStart(width, char=" ")`    | string or number      | padded on the left to `width` code points with `char` (exactly one code point)       |
| `default(value)`               | anything              | `value` when the input is `null`, else the input                                     |
| `length`                       | string or array       | code points of a string, items of an array                                           |
| `join(separator=", ")`         | array                 | the items written as in text, separated; arrays and objects in it are a `type` error |
| `first`                        | array or string       | the first item (`null` when empty) or code point                                     |
| `last`                         | array or string       | the last item (`null` when empty) or code point                                      |

Arguments are expressions; a `null` argument means its default. Decimals, lengths and widths must be integers. Number
filters round with `toFixed` (exact on the binary value: `1.005 | number(2)` is `1.00`); from `1e21` on a number is
written as `String(n)` (`1e+21`). `-0` and values that round to zero are written without a sign.

## Locales

The scope's locale (`createScope(data, { locale })`, default `en`) applies to `number`, `compact`, `percent` and
`date`; a `locale` argument overrides it. A tag is matched case-insensitively as a whole, then by its language subtag
(`de-AT` uses `de`); anything else is `unknown-locale`. The tables are fixed in the package and never come from `Intl`
or the host, because ICU data differs between Node and browsers.

A design states its locale once with the root property `locale` (`en`, `de`, `fr`, `es` or `cs`, exactly these lowercase
tags); the renderer hands it to the scope, so every expression of the design formats with it. The first of these wins:

1. the filter's `locale` argument,
2. the render option `locale` (the CLI `--locale`), an explicit choice of the caller for one render,
3. the design's `locale`,
4. `en`.

The design takes no region tags (`cs-CZ` is not valid there): a region table can later be added as a new value without
changing the meaning of a design that is valid today. `supportedLocales` from `@readmint/expr` lists the tags.

| locale | decimal | group             | grouping from | percent | compact suffixes (K, M, B, T)   | default date  |
| ------ | ------- | ----------------- | ------------- | ------- | ------------------------------- | ------------- |
| en     | `.`     | `,`               | 4 digits      | `25%`   | `K` `M` `B` `T`                 | `MMM d, yyyy` |
| de     | `,`     | `.`               | 4 digits      | `25 %`  | ` Tsd.` ` Mio.` ` Mrd.` ` Bio.` | `dd.MM.yyyy`  |
| fr     | `,`     | U+202F (narrow)   | 4 digits      | `25 %`  | ` k` ` M` ` Md` ` Bn`           | `d MMM yyyy`  |
| es     | `,`     | `.`               | 5 digits      | `25 %`  | ` mil` ` M` ` mil M` ` B`       | `d MMM yyyy`  |
| cs     | `,`     | U+00A0 (no-break) | 4 digits      | `25 %`  | ` tis.` ` mil.` ` mld.` ` bil.` | `d. M. yyyy`  |

The space before `%` and before a compact suffix is U+00A0 NO-BREAK SPACE. Separators, grouping, the percent pattern,
month and weekday names (wide and abbreviated, format context: Czech months in the genitive, `5. ledna`), AM/PM
markers and the default date pattern are Unicode CLDR 48 values. The compact suffixes are Readmint's own: CLDR's short
forms, except German thousands (`Tsd.`, CLDR writes `1234`) and Spanish billions (`mil M`, CLDR writes `1234 M`). The
CLDR data is used under the Unicode License v3; its copyright and permission notice is in `packages/expr/src/locales.ts` and `packages/expr/LICENSE-CLDR`.
The Spanish AM/PM markers (`a. m.`, `p. m.`) hold U+202F NARROW NO-BREAK SPACE.

## Dates

`date` takes an ISO 8601 string or an integer of epoch milliseconds, and works in UTC only: no clock, no host time
zone, no `Date.parse`.

- Accepted text: `YYYY-MM-DD`, optionally followed by `THH:mm`, `THH:mm:ss` or `THH:mm:ss.f` (1 to 9 fraction digits,
  milliseconds kept) and then `Z`, `+HH:mm`, `-HH:mm` or nothing (UTC). A date alone is midnight UTC; an offset is
  converted to UTC (`2024-03-05T00:30+01:00` is March 4).
- Years 0000 to 9999 of the proleptic Gregorian calendar, before and after any offset; 29 February only in leap years.
  Anything else is `invalid-date`.

| pattern       | output                    | pattern   | output               |
| ------------- | ------------------------- | --------- | -------------------- |
| `yyyy`, `yy`  | `2024`, `24`              | `H`, `HH` | hour 0-23: `9`, `09` |
| `M`, `MM`     | `3`, `03`                 | `h`, `hh` | hour 1-12: `9`, `09` |
| `MMM`, `MMMM` | `Mar`, `March` (locale)   | `a`       | `AM` / `PM` (locale) |
| `d`, `dd`     | `5`, `05`                 | `m`, `mm` | minute: `7`, `07`    |
| `EEE`, `EEEE` | `Tue`, `Tuesday` (locale) | `s`, `ss` | second: `9`, `09`    |

Text in single quotes is literal (`'at' HH:mm`), `''` is a quote, and any other character that is not an ASCII letter
is copied. Any other ASCII letter, or another run length of these letters, is an `argument` error, so a future field
cannot silently change an existing pattern. A pattern has at most 64 characters.

## Limits

| limit         | value                                                                           | error code  |
| ------------- | ------------------------------------------------------------------------------- | ----------- |
| source        | 10000 code points per compiled string (as the format counts), before scanning   | `too-long`  |
| nesting       | 64 levels of parentheses, brackets, unary operators, `? :` and filter arguments | `too-deep`  |
| steps         | 100000 per evaluation, or a shared budget (see API)                             | `budget`    |
| strings       | 100000 UTF-16 code units for any string produced                                | `too-large` |
| arrays        | 10000 items in an array literal and in a `repeat`                               | `too-large` |
| filter args   | 4 per call                                                                      | `argument`  |
| error excerpt | 64 characters of the source                                                     |             |

A step is one expression node, plus one per 16 characters or one per item a filter or operator processes: string
`+`, `==`, `!=` and `< <= > >=`, a string used as an index, literal text, and every filter that reads a string or
an array. Work is
charged and sizes are checked before the work is done, so a hostile expression stops early. Long flat chains
(`a + b + …`, `a.b.c…`, `a | f | g …`) are evaluated by loops; only nesting counts against the depth limit.

## Errors

Compiling and evaluating never throw; they return `{ ok: false, error }`:

```ts
interface ExpressionError {
  code: ExpressionErrorCode;
  message: string; // ends with "at column <start + 1>"
  start: number; // 0-based UTF-16 offsets into the compiled string; end exclusive
  end: number;
  excerpt: string; // the {{ }} placeholder around start, at most 64 characters, "…" where cut
}
```

Messages name types, operators, filters and names from the design, never a value from the data. In the excerpt,
control characters, the line and paragraph separators, the twelve Bidi_Control characters and lone surrogates are
written as `\u{…}`.

| code             | meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `syntax`         | the placeholder is not valid: unexpected token, unclosed `{{` or string, bad escape |
| `too-long`       | the string is longer than 10000 characters                                          |
| `too-deep`       | nesting deeper than 64 levels                                                       |
| `unknown-name`   | neither a local nor the data has this name                                          |
| `unknown-filter` | no filter has this name                                                             |
| `argument`       | a filter got too many or too few arguments, or one of the wrong kind or range       |
| `type`           | an operator or filter got a value of the wrong type                                 |
| `not-finite`     | arithmetic gave an infinite or undefined number                                     |
| `too-large`      | a string, an array literal or a repeat would pass its size limit                    |
| `budget`         | the evaluation took more steps than its budget                                      |
| `unknown-locale` | the locale is not one of en, de, fr, es, cs                                         |
| `invalid-date`   | not an ISO 8601 date or epoch milliseconds in the years 0000 to 9999                |
| `invalid-data`   | the data holds something that is not a JSON value where it was read                 |

## API

```ts
import {
  compileTemplate,
  createScope,
  createBudget,
  evaluateCondition,
  expandRepeat,
  ExpressionLimits,
  toText,
} from "@readmint/expr";

const template = compileTemplate("{{ github.followers | compact }} followers"); // ExprResult<Template>
if (!template.ok) report(template.error);

const budget = createBudget(); // optional: one budget shared by a whole render
const scope = createScope(data, { locale: "de", budget }); // data: a plain JSON object
template.value.evaluate(scope); // ExprResult<ExprValue>
template.value.kind; // "expression" (exactly one placeholder) or "text"

evaluateCondition(ifTemplate, scope); // ExprResult<boolean>, for a layer's `if`
expandRepeat(eachTemplate, scope, { as: "repo", index: "i" }); // ExprResult<Scope[]>, one child scope per item
scope.with({ props: { label: "Stars" } }); // a child scope with locals, e.g. component props
toText(value); // string | undefined: a value written as a placeholder in text is; undefined for an array or object
```

- `ExprResult<T>` is `{ ok: true, value: T } | { ok: false, error: ExpressionError }`; `ExprValue` is a JSON value.
- A `Template` is frozen and reusable; compile each design string once.
- `expandRepeat` defaults `as` to `item` and `index` to `index` (0-based); both must be names an expression can
  read (`repo-index`, not `repo-1`, `1st` or `true`) and differ, else `argument`; `null` repeats nothing, anything but an
  array is a `type` error, more than 10000 items `too-large`. Child scopes keep the outer locals and data.
- Without a shared budget each `evaluate` gets a fresh one of 100000 steps; with `createBudget(n)` passed to
  `createScope`, every evaluation in that scope and its children draws from the same `n` steps, and an exhausted
  budget stays exhausted. `createBudget` throws a `RangeError` for a negative or fractional `n`: that is a caller
  bug, never design input.

## Determinism

The same template, data and locale give the same value in Node and in every browser: no `Intl`, no host locale or
time zone, no clock, no randomness; numbers are written by `toFixed` and `String(n)`, both exactly specified, and
strings are compared by code unit. `upper` and `lower` never use `toUpperCase` / `toLowerCase`, whose mappings change
with the engine's Unicode version: they use a fixed table of the simple (one to one) Unicode case mappings for Basic
Latin, Latin-1 Supplement, Latin Extended-A, Greek and Coptic, and Cyrillic, and leave every other character
unchanged. Nothing expands: `ß` stays `ß`, `İ` lowers to `i`, and `Σ` always lowers to `σ`. `trim` removes a fixed
set: tab, line feed, vertical tab, form feed, carriage return, space, U+00A0, U+1680, U+2000 to U+200A, U+2028,
U+2029, U+202F, U+205F, U+3000 and U+FEFF. A shared corpus of expressions is checked in Node and in headless Chromium.
