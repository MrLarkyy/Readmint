import { expect, test } from "vitest";
import { corpus, corpusData } from "./corpus.js";
import { evaluateText } from "./evaluateText.js";

test.each(corpus)("Node: $text ($locale)", ({ text, locale, expected, error }) => {
  const result = evaluateText(text, corpusData, locale === undefined ? {} : { locale });
  if (error === undefined) expect(result).toEqual({ ok: true, value: expected });
  else expect(!result.ok && result.error.code).toBe(error);
});

test("the corpus is large enough to matter", () => {
  expect(corpus.length).toBeGreaterThanOrEqual(60);
});
