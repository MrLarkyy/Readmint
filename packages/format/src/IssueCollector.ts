import type { DesignIssue } from "./DesignIssue.js";
import { DesignLimits } from "./DesignLimits.js";

/** Collects issues in discovery order up to `maxIssues`; walkers stop once it is full. */
export class IssueCollector {
  readonly issues: DesignIssue[] = [];
  private refused = false;

  add(issue: DesignIssue): void {
    if (this.issues.length >= DesignLimits.maxIssues) {
      this.refused = true;
      return;
    }
    this.issues.push(issue);
  }

  /** An issue was dropped: the result is marked truncated. */
  get truncated(): boolean {
    return this.refused;
  }

  /** A method, not a property, so a check is never narrowed away across walker calls. */
  isFull(): boolean {
    return this.refused;
  }

  get isEmpty(): boolean {
    return this.issues.length === 0;
  }
}
