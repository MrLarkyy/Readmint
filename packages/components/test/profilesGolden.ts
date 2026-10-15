import { defineGoldenSuite, type GoldenSuite } from "@readmint/golden";
import { profileTemplates, type ProfileSection, type ProfileTemplate } from "../src/index.js";
import { embeddedFonts } from "../../renderer/test/embeddedFonts.js";
import {
  loadProfile,
  renderProfile,
  type ProfileRender,
  type ProfileTheme,
} from "./profileDesigns.js";
import { sampleProfileData, worstCaseProfileData } from "./sampleProfileData.js";

const themes: readonly ProfileTheme[] = ["light", "dark"];

/** The sections whose worst-case data (1024-character texts, 10^15 counts, 600 pushes) is pinned by a golden. */
const longSections: Readonly<Record<ProfileTemplate, readonly ProfileSection[]>> = {
  "year-ring": ["header", "year", "recent", "repo-1"],
  horizon: ["header", "year", "repo-1", "stack"],
  pinscreen: ["header", "year", "repo-1", "log"],
};

/** A frame mid-animation of one section per template, so the motion itself is pinned, not only its end state. */
const frames: Readonly<Record<ProfileTemplate, readonly [ProfileSection, number]>> = {
  "year-ring": ["year", 15000],
  horizon: ["header", 5000],
  pinscreen: ["year", 3000],
};

/** The golden suite of one profile template: every section in both themes, the long ones, and a mid frame. */
export function profileGoldenSuite(template: ProfileTemplate): GoldenSuite<ProfileRender> {
  const data = sampleProfileData();
  const render = (
    section: ProfileSection,
    theme: ProfileTheme,
    extra: Partial<ProfileRender> = {},
  ) => ({
    template,
    design: loadProfile(template, section, theme),
    data,
    ...extra,
  });
  const [frameSection, frameTime] = frames[template];
  return defineGoldenSuite<ProfileRender>({
    name: `profiles-${template}`,
    render: renderProfile,
    fontsFromSvg: embeddedFonts,
    // Chromium draws the animated SVG a moment after it starts, with the one-shot reveals at their first state, while
    // the PNG golden is the final one (frame 0): the browser leg tolerates that share of pixels, the Node leg none.
    browserTolerance: { maxDiffRatio: 0.05 },
    fixtures: [
      ...profileTemplates[template].flatMap((section) =>
        themes.map((theme) => ({ name: `${section}-${theme}`, input: render(section, theme) })),
      ),
      ...longSections[template].map((section) => ({
        name: `${section}-long`,
        input: render(section, "light", { data: worstCaseProfileData() }),
      })),
      {
        name: `${frameSection}-t${String(frameTime)}`,
        input: render(frameSection, "light", { time: frameTime }),
      },
    ],
  });
}
