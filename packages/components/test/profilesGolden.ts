import { defineGoldenSuite, type GoldenSuite } from "@readmint/golden";
import { profileTemplates, type ProfileSection, type ProfileTemplate } from "../src/index.js";
import { embeddedFonts } from "../../renderer/test/embeddedFonts.js";
import {
  loadExampleProfile,
  loadProfile,
  renderProfile,
  type ProfileRender,
  type ProfileTheme,
} from "./profileDesigns.js";
import { profileExampleProps } from "@readmint/examples/props";
import { sampleProfileData, sparseProfileData, worstCaseProfileData } from "./sampleProfileData.js";

/** Chromium and resvg place the 11-13 px monospaced code and terminal text of pinscreen a sub-pixel apart. */
const browserTolerances: Readonly<Partial<Record<ProfileTemplate, { maxDiffRatio: number }>>> = {
  pinscreen: { maxDiffRatio: 0.02 },
};

const themes: readonly ProfileTheme[] = ["light", "dark"];

/** The sections whose worst-case data (1024-character texts, 10^15 counts, 600 pushes) is pinned by a golden. */
const longSections: Readonly<Record<ProfileTemplate, readonly ProfileSection[]>> = {
  "year-ring": ["header", "year", "recent", "repo-1"],
  horizon: ["header", "ticker", "year", "repo-1"],
  pinscreen: ["header", "year", "repo-1", "log"],
};

/** A frame mid-animation of one section per template, so the motion itself is pinned, not only its end state. */
const frames: Readonly<Record<ProfileTemplate, readonly [ProfileSection, number]>> = {
  "year-ring": ["year", 15000],
  horizon: ["ticker", 5000],
  pinscreen: ["year", 3000],
};

/**
 * The golden suite of one profile template: every section in both themes with the example's personal texts, the
 * long ones on worst-case data, the year on a sparse, spiky calendar, the sections with personal texts left empty,
 * and a mid frame.
 */
export function profileGoldenSuite(template: ProfileTemplate): GoldenSuite<ProfileRender> {
  const data = sampleProfileData();
  const render = (
    section: ProfileSection,
    theme: ProfileTheme,
    extra: Partial<ProfileRender> = {},
  ) => ({
    template,
    design: loadExampleProfile(template, section, theme),
    data,
    time: 0,
    ...extra,
  });
  const [frameSection, frameTime] = frames[template];
  const personal = profileTemplates[template].filter(
    (section) => profileExampleProps[template]?.[section] !== undefined,
  );
  return defineGoldenSuite<ProfileRender>({
    name: `profiles-${template}`,
    render: renderProfile,
    fontsFromSvg: embeddedFonts,
    ...(browserTolerances[template] === undefined
      ? {}
      : { browserTolerance: browserTolerances[template] }),
    fixtures: [
      ...profileTemplates[template].flatMap((section) =>
        themes.map((theme) => ({ name: `${section}-${theme}`, input: render(section, theme) })),
      ),
      ...longSections[template].map((section) => ({
        name: `${section}-long`,
        input: render(section, "light", { data: worstCaseProfileData() }),
      })),
      ...themes.map((theme) => ({
        name: `year-sparse-${theme}`,
        input: render("year", theme, { data: sparseProfileData() }),
      })),
      ...personal.map((section) => ({
        name: `${section}-empty`,
        input: render(section, "light", { design: loadProfile(template, section) }),
      })),
      {
        name: `${frameSection}-t${String(frameTime)}`,
        input: render(frameSection, "light", { time: frameTime }),
      },
    ],
  });
}
