import { element } from "./dom.js";
import { timeAt, type Playhead } from "./Playhead.js";

/** What the transport asks the editor to do. */
export interface TimelineActions {
  play(): void;
  pause(): void;
  /** Stops at `time` ms. */
  seek(time: number): void;
}

/** What the transport shows. */
export interface TimelineView {
  readonly duration: number;
  readonly loop: boolean;
  readonly playhead: Playhead;
}

/**
 * Play / Pause, a scrubber and the time in milliseconds, under the canvas; hidden when the design has no timeline.
 * While playing, a frame loop moves the scrubber along the playhead clock and nothing else: the preview is the
 * animated SVG itself. Scrubbing or typing a time pauses at that time.
 */
export class TimelineBar {
  readonly root: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly scrubber: HTMLInputElement;
  private readonly time: HTMLInputElement;
  private view: TimelineView | undefined;
  private frame: number | undefined;
  private disposed = false;

  constructor(
    parent: Element,
    private readonly actions: TimelineActions,
  ) {
    this.root = element(parent, "div", {
      className: "rm-timeline-bar",
      attributes: { role: "group", "aria-label": "Timeline" },
    });
    this.root.hidden = true;
    this.toggle = element(this.root, "button", {
      text: "Play",
      attributes: { type: "button", "data-action": "toggle-play", "aria-pressed": "true" },
    });
    this.scrubber = element(this.root, "input", {
      attributes: { type: "range", min: "0", step: "1", name: "scrub", "aria-label": "Time" },
    });
    this.time = element(this.root, "input", {
      attributes: { type: "number", min: "0", step: "1", name: "time", "aria-label": "Time in ms" },
    });
    this.toggle.addEventListener("click", () => {
      if (this.view?.playhead.playing === true) this.actions.pause();
      else this.actions.play();
    });
    this.scrubber.addEventListener("input", () => {
      this.actions.seek(Number(this.scrubber.value));
    });
    this.time.addEventListener("change", () => {
      this.actions.seek(Number(this.time.value));
    });
  }

  /** Shows `view`, or hides the bar when the design has no timeline. */
  update(view: TimelineView | undefined): void {
    this.view = view;
    this.root.hidden = view === undefined;
    this.stop();
    if (view === undefined) return;
    const { playing } = view.playhead;
    this.toggle.setAttribute("aria-pressed", String(playing));
    this.scrubber.max = String(view.duration);
    this.time.max = String(view.duration);
    this.show(view.playhead.time);
    if (playing) this.run();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private show(time: number): void {
    this.scrubber.value = String(time);
    if (this.time.ownerDocument.activeElement !== this.time) this.time.value = String(time);
  }

  private run(): void {
    const win = this.root.ownerDocument.defaultView;
    if (win === null || this.disposed) return;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = undefined;
      const view = this.view;
      if (view === undefined || !view.playhead.playing || this.disposed) return;
      this.show(timeAt(view.playhead, win.performance.now(), view.duration, view.loop));
      this.run();
    });
  }

  private stop(): void {
    if (this.frame === undefined) return;
    this.root.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }
}
