import { expect, test } from "vitest";
import { corpus, corpusData } from "./corpus.js";
import { evaluateText } from "./evaluateText.js";

test.each(corpus)("Chromium: $text ($locale)", ({ text, locale, expected, error }) => {
  const result = evaluateText(text, corpusData, locale === undefined ? {} : { locale });
  if (error === undefined) expect(result).toEqual({ ok: true, value: expected });
  else expect(!result.ok && result.error.code).toBe(error);
});
