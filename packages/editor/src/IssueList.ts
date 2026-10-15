import { clear, element } from "./dom.js";
import type { EditorIssue } from "./EditorIssue.js";

/** The editor's issues; one with a pointer into a layer selects that layer when clicked. */
export class IssueList {
  readonly root: HTMLUListElement;

  constructor(
    parent: Element,
    private readonly select: (pointer: string) => void,
  ) {
    this.root = element(parent, "ul", {
      className: "rm-issues",
      attributes: { "aria-label": "Issues" },
    });
  }

  update(issues: readonly EditorIssue[]): void {
    clear(this.root);
    for (const issue of issues) {
      const item = element(this.root, "li", { className: `rm-issue rm-issue-${issue.source}` });
      const layer = issue.path === undefined ? undefined : layerOf(issue.path);
      const text = `${issue.source}: ${issue.message}${issue.path === undefined || issue.path === "" ? "" : ` (${issue.path})`}`;
      if (layer === undefined) {
        item.textContent = text;
        continue;
      }
      const button = element(item, "button", { text, attributes: { type: "button" } });
      button.addEventListener("click", () => {
        this.select(layer);
      });
    }
  }
}

/** The pointer of the innermost layer a design pointer lies in, if it lies in one. */
function layerOf(path: string): string | undefined {
  const match = /^\/layers\/\d+(?:\/children\/\d+)*/u.exec(path);
  return match?.[0];
}
