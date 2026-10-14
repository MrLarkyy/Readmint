import { ExpressionLimits } from "./ExpressionLimits.js";
import { isInvisible } from "./isInvisible.js";
import type { Span } from "./Span.js";

const ellipsis = "…";

/**
 * The part of `segment` (a `{{ }}` placeholder of `source`) around offset `at`: at most `maxEcho`
 * code units including the `…` marking a cut, with invisible characters and lone surrogates
 * written as `\u{..}` so an excerpt can be logged safely.
 */
export function quoteSource(source: string, segment: Span, at: number): string {
  const max = ExpressionLimits.maxEcho;
  let start = segment.start;
  let end = Math.min(segment.end, source.length);
  if (end - start > max) {
    start = Math.max(segment.start, Math.min(at - Math.floor(max / 4), end - max));
    end = start + max;
  }
  const cutBefore = start > segment.start;
  const cutAfter = end < Math.min(segment.end, source.length);
  if (cutBefore) start += 1;
  if (cutAfter) end -= 1;
  if (
    start > 0 &&
    isLowSurrogate(source.charCodeAt(start)) &&
    isHighSurrogate(source.charCodeAt(start - 1))
  ) {
    start += 1;
  }
  if (
    end < source.length &&
    isLowSurrogate(source.charCodeAt(end)) &&
    isHighSurrogate(source.charCodeAt(end - 1))
  ) {
    end -= 1;
  }
  return (
    (cutBefore ? ellipsis : "") +
    escapeInvisible(source.slice(start, end)) +
    (cutAfter ? ellipsis : "")
  );
}

function escapeInvisible(text: string): string {
  let escaped = "";
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (isHighSurrogate(unit) && isLowSurrogate(text.charCodeAt(index + 1))) {
      escaped += text.slice(index, index + 2);
      index++;
    } else if (isInvisible(unit) || isHighSurrogate(unit) || isLowSurrogate(unit)) {
      escaped += `\\u{${unit.toString(16)}}`;
    } else {
      escaped += text.charAt(index);
    }
  }
  return escaped;
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}
