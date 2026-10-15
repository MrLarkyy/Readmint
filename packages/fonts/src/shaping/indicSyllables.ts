import { Category } from "./indicCategories.js";

export const SyllableType = {
  consonant: 0,
  vowel: 1,
  standalone: 2,
  symbol: 3,
  broken: 4,
  nonIndic: 5,
} as const;

export interface Syllable {
  readonly start: number;
  readonly end: number;
  readonly type: number;
}

/**
 * Splits a run into Indic syllables by HarfBuzz's Indic grammar (hb-ot-shaper-indic-machine.rl): at each position the
 * longest of the consonant, vowel, standalone, symbol and broken patterns wins (the earlier one on a tie), else one
 * character is a non-Indic cluster. Hand-written matchers walk each pattern once, so the work is linear in the run.
 */
export function findSyllables(categories: readonly number[]): Syllable[] {
  const matcher = new SyllableMatcher(categories);
  const syllables: Syllable[] = [];
  let start = 0;
  while (start < categories.length) {
    const candidates = [
      matcher.consonantSyllable(start),
      matcher.vowelSyllable(start),
      matcher.standaloneCluster(start),
      matcher.symbolCluster(start),
      matcher.brokenCluster(start),
    ];
    let type: number = SyllableType.nonIndic;
    let end = start + 1;
    let longest = start;
    candidates.forEach((candidate, index) => {
      if (candidate > longest) {
        longest = candidate;
        type = index;
      }
    });
    if (longest > start) end = longest;
    syllables.push({ start, end, type });
    start = end;
  }
  return syllables;
}

class SyllableMatcher {
  constructor(private readonly categories: readonly number[]) {}

  /** (Repha|CS)? cn complex_syllable_tail */
  consonantSyllable(start: number): number {
    let at = start;
    if (this.is(at, Category.Repha) || this.is(at, Category.CS)) at++;
    const consonant = this.cn(at);
    return consonant < 0 ? -1 : this.complexTail(consonant);
  }

  /** reph? V n? (ZWJ | complex_syllable_tail) */
  vowelSyllable(start: number): number {
    let best = -1;
    for (const at of this.withOptionalReph(start)) {
      if (!this.is(at, Category.V)) continue;
      const vowel = this.n(at + 1);
      best = Math.max(best, this.complexTail(vowel), this.is(vowel, Category.ZWJ) ? vowel + 1 : -1);
    }
    return best;
  }

  /** ((Repha|CS)? PLACEHOLDER | reph? DOTTEDCIRCLE) n? complex_syllable_tail */
  standaloneCluster(start: number): number {
    let best = -1;
    const placeholder =
      this.is(start, Category.Repha) || this.is(start, Category.CS) ? start + 1 : start;
    for (const at of [start, placeholder]) {
      if (this.is(at, Category.PLACEHOLDER))
        best = Math.max(best, this.complexTail(this.n(at + 1)));
    }
    for (const at of this.withOptionalReph(start)) {
      if (this.is(at, Category.DOTTEDCIRCLE)) {
        best = Math.max(best, this.complexTail(this.n(at + 1)));
      }
    }
    return best;
  }

  /** Symbol N? syllable_tail */
  symbolCluster(start: number): number {
    if (!this.is(start, Category.Symbol)) return -1;
    let at = start + 1;
    if (this.is(at, Category.N)) at++;
    return this.syllableTail(at);
  }

  /** reph? n? complex_syllable_tail */
  brokenCluster(start: number): number {
    let best = -1;
    for (const at of this.withOptionalReph(start)) {
      best = Math.max(best, this.complexTail(this.n(at)));
    }
    return best;
  }

  private is(at: number, category: number): boolean {
    return this.categories[at] === category;
  }

  private isJoiner(at: number): boolean {
    return this.is(at, Category.ZWJ) || this.is(at, Category.ZWNJ);
  }

  /** `start`, and the position after a reph (Ra H or Repha) when one starts there. */
  private withOptionalReph(start: number): number[] {
    if (this.is(start, Category.Ra) && this.is(start + 1, Category.H)) return [start, start + 2];
    if (this.is(start, Category.Repha)) return [start, start + 1];
    return [start];
  }

  /** c ZWJ? n?, c = C | Ra; -1 when no consonant starts here. */
  private cn(at: number): number {
    if (!this.is(at, Category.C) && !this.is(at, Category.Ra)) return -1;
    let end = at + 1;
    if (this.is(end, Category.ZWJ)) end++;
    return this.n(end);
  }

  /** ((ZWNJ? RS)? (N N?)?) */
  private n(at: number): number {
    let end = at;
    if (this.is(end, Category.ZWNJ) && this.is(end + 1, Category.RS)) end += 2;
    else if (this.is(end, Category.RS)) end++;
    if (this.is(end, Category.N)) {
      end++;
      if (this.is(end, Category.N)) end++;
    }
    return end;
  }

  /** z? H (ZWJ N?)?; -1 without a halant. */
  private halantGroup(at: number): number {
    let end = at;
    if (this.isJoiner(end) && this.is(end + 1, Category.H)) end++;
    if (!this.is(end, Category.H)) return -1;
    end++;
    if (this.is(end, Category.ZWJ)) {
      end++;
      if (this.is(end, Category.N)) end++;
    }
    return end;
  }

  /** z* M N? H?; -1 without a matra. */
  private matraGroup(at: number): number {
    let end = at;
    while (this.isJoiner(end)) end++;
    if (!this.is(end, Category.M)) return -1;
    end++;
    if (this.is(end, Category.N)) end++;
    if (this.is(end, Category.H)) end++;
    return end;
  }

  /** (z? SM SM? ZWNJ?)? A* */
  private syllableTail(at: number): number {
    let end = at;
    const modifier = this.isJoiner(end) ? end + 1 : end;
    if (this.is(modifier, Category.SM)) {
      end = modifier + 1;
      if (this.is(end, Category.SM)) end++;
      if (this.is(end, Category.ZWNJ)) end++;
    }
    while (this.is(end, Category.A)) end++;
    return end;
  }

  /** (halant_group cn)* CM? (final_halant_group | matra_group*) syllable_tail */
  private complexTail(at: number): number {
    let end = at;
    for (;;) {
      const halant = this.halantGroup(end);
      const consonant = halant < 0 ? -1 : this.cn(halant);
      if (consonant < 0) break;
      end = consonant;
    }
    if (this.is(end, Category.CM)) end++;
    let longest = end;
    longest = Math.max(longest, this.halantGroup(end));
    if (this.is(end, Category.H) && this.is(end + 1, Category.ZWNJ))
      longest = Math.max(longest, end + 2);
    for (let matra = this.matraGroup(end); matra >= 0; matra = this.matraGroup(matra)) {
      longest = Math.max(longest, matra);
    }
    return this.syllableTail(longest);
  }
}
