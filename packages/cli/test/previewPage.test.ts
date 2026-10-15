import { setImmediate as tick } from "node:timers/promises";
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vitest";
import { previewPage } from "../src/previewPage.js";

const hint = "forbidden: open the address the preview printed\n";

class FakeElement {
  hidden = false;
  src = "";
  textContent = "";
  addEventListener(): void {
    // The image's load and error events are not driven here.
  }
}

class FakeEventSource {
  static readonly CLOSED = 2;
  static readonly opened: FakeEventSource[] = [];
  readyState = 0;
  readonly #listeners = new Map<string, () => void>();
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(type: string, listener: () => void): void {
    this.#listeners.set(type, listener);
  }
  emit(type: string): void {
    this.#listeners.get(type)?.();
  }
}

/** Runs the page's own script against stubs; `replies` answers each fetch in turn. */
function runPage(replies: Response[]) {
  const script = /<script>([\s\S]*)<\/script>/.exec(previewPage.html)?.[1] ?? "";
  const elements = { render: new FakeElement(), issues: new FakeElement() };
  const fetched: string[] = [];
  FakeEventSource.opened.length = 0;
  runInContext(
    script,
    createContext({
      document: { getElementById: (id: "render" | "issues") => elements[id] },
      fetch: (url: string) => {
        fetched.push(url);
        return Promise.resolve(replies.shift() ?? new Response("gone", { status: 503 }));
      },
      EventSource: FakeEventSource,
    }),
  );
  return { ...elements, fetched, stream: FakeEventSource.opened[0] };
}

const ok = () => Response.json({ version: 1, ok: true, issues: [] });
const refused = () => new Response(hint, { status: 403 });

test("a refused status shows its body and hides the image", async () => {
  const page = runPage([refused()]);
  await tick();
  await tick();
  expect(page.fetched).toEqual(["status"]);
  expect(page.issues.textContent).toBe(hint);
  expect(page.render.hidden).toBe(true);
});

test("a closed event stream refreshes once and shows why; a reconnecting one does not", async () => {
  const page = runPage([ok(), refused()]);
  await tick();
  await tick();
  expect(page.render.src).toBe("render.svg?v=1");
  expect(page.stream?.url).toBe("events");
  page.stream?.emit("error");
  expect(page.fetched).toHaveLength(1);
  if (page.stream !== undefined) page.stream.readyState = FakeEventSource.CLOSED;
  page.stream?.emit("error");
  await tick();
  await tick();
  expect(page.fetched).toEqual(["status", "status"]);
  expect(page.issues.textContent).toBe(hint);
  expect(page.render.hidden).toBe(true);
});
