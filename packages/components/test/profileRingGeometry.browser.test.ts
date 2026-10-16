import { renderSvg } from "@readmint/renderer";
import { afterEach, describe, expect, test } from "vitest";
import { loadProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const themes: readonly ProfileTheme[] = ["light", "dark"];
const times = [0, 15_000, 30_000, 45_000];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

let host: HTMLElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
});

function render(theme: ProfileTheme, time?: number): string {
  const design = loadProfile("year-ring", "year", theme);
  const rendered = renderSvg(design, {
    data: sampleProfileData(),
    assets: { fonts: profileFontAssets("year-ring", design) },
    ...(time === undefined ? {} : { time }),
  });
  if (!rendered.ok) throw new Error(`render: ${JSON.stringify(rendered.issues)}`);
  return rendered.svg;
}

/** Puts the SVG on the page, paused at `pausedAt` if animated, and returns the middle and size of every month label's box. */
async function labelBoxes(svg: string, pausedAt?: number): Promise<ReadonlyMap<string, Box>> {
  host?.remove();
  host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;margin:0";
  host.innerHTML = svg;
  document.body.append(host);
  if (pausedAt !== undefined) pauseAt(pausedAt);
  await document.fonts.ready;
  const boxes = new Map<string, Box>();
  for (const span of Array.from(host.querySelectorAll("tspan"))) {
    const word = span.textContent;
    if (!months.includes(word)) continue;
    const rect = span.getBoundingClientRect();
    boxes.set(word, {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      width: rect.width,
      height: rect.height,
    });
  }
  return boxes;
}

function pauseAt(time: number): void {
  const animations = document.getAnimations();
  expect(animations.length).toBeGreaterThan(0);
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = time;
  }
}

describe("year ring in Chromium", () => {
  test.each(themes)(
    "plays the month labels where the frames put them, upright (%s)",
    async (theme) => {
      const animated = render(theme);
      const sizes = new Map<string, Box>();
      for (const time of times) {
        const playedAt = await labelBoxes(animated, time);
        expect(playedAt.size).toBe(months.length);
        const frame = await labelBoxes(render(theme, time));
        for (const word of months) {
          const [got, want] = [playedAt.get(word), frame.get(word)];
          if (got === undefined || want === undefined) throw new Error(`${word} missing`);
          expect(
            Math.hypot(got.x - want.x, got.y - want.y),
            `${word} at ${String(time)} ms`,
          ).toBeLessThan(0.5);
          const first = sizes.get(word) ?? got;
          sizes.set(word, first);
          expect(got.width, `${word} width at ${String(time)} ms`).toBeCloseTo(first.width, 2);
          expect(got.height, `${word} height at ${String(time)} ms`).toBeCloseTo(first.height, 2);
        }
      }
    },
  );
});
