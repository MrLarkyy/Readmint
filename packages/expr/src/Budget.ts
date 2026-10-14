import { ExpressionLimits } from "./ExpressionLimits.js";

/**
 * Steps an evaluation may take: one per expression node plus work proportional to the size of
 * what filters and operators process. One budget may be shared by every evaluation of a render.
 */
export class Budget {
  #used = 0;

  constructor(readonly maxSteps: number) {
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 0) {
      throw new RangeError("maxSteps must be a non-negative safe integer");
    }
  }

  get used(): number {
    return this.#used;
  }

  get exhausted(): boolean {
    return this.#used > this.maxSteps;
  }

  /** Records `steps` before the work is done; false once the total passes `maxSteps`, and from then on. */
  charge(steps: number): boolean {
    this.#used += steps;
    return this.#used <= this.maxSteps;
  }
}

export function createBudget(maxSteps: number = ExpressionLimits.maxSteps): Budget {
  return new Budget(maxSteps);
}
