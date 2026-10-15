/**
 * Whether `text` has more than `max` code points (a surrogate pair counts once, a lone surrogate once), as the format
 * counts string lengths. Counting stops past `max`, so a huge text costs no more than a long one.
 */
export function exceedsCodePoints(text: string, max: number): boolean {
  if (text.length <= max) return false;
  if (text.length > 2 * max) return true;
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
    }
    if (++count > max) return true;
  }
  return false;
}
