import { afterEach, describe, expect, test } from "vitest";
import { animatedSnapshot } from "./animatedSnapshot.js";
import { animationDesigns } from "./animationDesigns.js";
import calendar from "./golden/renderer-animation-svg/calendar.svg?raw";
import cycles from "./golden/renderer-animation-svg/cycles.svg?raw";
import drawMulti from "./golden/renderer-animation-svg/draw-multi.svg?raw";
import draw from "./golden/renderer-animation-svg/draw.svg?raw";
import easing from "./golden/renderer-animation-svg/easing.svg?raw";
import orbit from "./golden/renderer-animation-svg/orbit-speed.svg?raw";
import tracks from "./golden/renderer-animation-svg/tracks.svg?raw";
import { renderFixture } from "./renderFixture.js";

const snapshots: Readonly<Record<string, string>> = {
  calendar,
  cycles,
  draw,
  "draw-multi": drawMulti,
  easing,
  "orbit-speed": orbit,
  tracks,
};

afterEach(() => {
  document.body.replaceChildren();
});

/** Elements drawn, in document order; definitions and accessibility text left out. */
function drawnElements(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter(
    (element) => element.closest("defs") === null && !["title", "desc"].includes(element.localName),
  );
}

function rgb(text: string): number[] {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/u.exec(text);
  if (hex !== null) return hex.slice(1).map((channel) => Number.parseInt(channel, 16));
  return (text.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
}

function frameMatrix(element: Element): DOMMatrix {
  const transform = (element as SVGGraphicsElement).transform.baseVal.consolidate();
  return transform === null ? new DOMMatrix() : DOMMatrix.fromMatrix(transform.matrix);
}

/** The values the browser plays at the paused time against the attributes of the static frame. */
function compare(played: Element, frame: Element, where: string): void {
  const style = getComputedStyle(played);
  const number = (name: string, fallback: string) => Number(frame.getAttribute(name) ?? fallback);
  expect(Number(style.opacity), `${where} opacity`).toBeCloseTo(number("opacity", "1"), 2);
  for (const paint of ["fill", "stroke"] as const) {
    const attribute = frame.getAttribute(paint);
    if (attribute?.startsWith("#") !== true) continue;
    const actual = rgb(style.getPropertyValue(paint));
    rgb(attribute).forEach((channel, index) => {
      expect(Math.abs((actual[index] ?? -9) - channel), `${where} ${paint}`).toBeLessThanOrEqual(1);
    });
    expect(
      Number(style.getPropertyValue(`${paint}-opacity`)),
      `${where} ${paint}-opacity`,
    ).toBeCloseTo(number(`${paint}-opacity`, "1"), 2);
  }
  if (frame.hasAttribute("stroke-dashoffset")) {
    expect(Number.parseFloat(style.strokeDashoffset), `${where} dash offset`).toBeCloseTo(
      number("stroke-dashoffset", "0"),
      1,
    );
  }
  const actual = style.transform === "none" ? new DOMMatrix() : new DOMMatrix(style.transform);
  const expected = frameMatrix(frame);
  for (const key of ["a", "b", "c", "d", "e", "f"] as const) {
    expect(actual[key], `${where} transform ${key}`).toBeCloseTo(expected[key], 2);
  }
}

describe.each(animationDesigns.map((entry) => [entry.name, entry] as const))(
  "%s in Chromium",
  (name, { input, times }) => {
    test("renders the bytes of the Node snapshot", () => {
      expect(animatedSnapshot(name)).toBe(snapshots[name]);
    });

    const duration = input.design.animation?.duration ?? 0;
    // Past the end too: a loop starts over, a single run holds its end.
    test.each([...times, duration + 100, 2 * duration])(
      "plays at %d ms what the frame at that time draws",
      (time) => {
        const host = document.createElement("div");
        host.innerHTML = renderFixture(input);
        document.body.append(host);
        const animations = document.getAnimations();
        expect(animations.length).toBeGreaterThan(0);
        const play = (at: number) => {
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = at;
          }
        };
        play(time);
        const frame = new DOMParser().parseFromString(
          renderFixture({ ...input, time }),
          "image/svg+xml",
        );
        const svg = host.querySelector("svg");
        if (svg === null) throw new Error("no svg");
        const played = drawnElements(svg);
        const drawn = drawnElements(frame.documentElement);
        expect(played.map((element) => element.localName)).toEqual(
          drawn.map((element) => element.localName),
        );
        const pairs = played.flatMap((element, index) => {
          const counterpart = drawn[index];
          if (!element.hasAttribute("class") || counterpart === undefined) return [];
          expect(counterpart.hasAttribute("class")).toBe(false);
          return [{ element, counterpart, where: `${element.localName} ${String(index)}` }];
        });
        expect(pairs.length).toBeGreaterThan(0);
        const mismatches = pairs.flatMap((pair) => {
          try {
            compare(pair.element, pair.counterpart, pair.where);
            return [];
          } catch (error) {
            return [{ ...pair, error }];
          }
        });
        if (mismatches.length === 0) return;
        // A frame at a jump draws the later value from half a step before it; a browser reaches that value only at the
        // end of the run, 3 steps covering a run of up to three keyframes at one moment. The time-0 rule is checked
        // by sampleAnimation.test.ts and the profile frame-0 tests, not here.
        play(time + (3 * duration) / 100_000);
        for (const { element, counterpart, where, error } of mismatches) {
          try {
            compare(element, counterpart, where);
          } catch {
            throw error;
          }
        }
      },
    );
  },
);
