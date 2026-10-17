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
import {
  longLocationProfileData,
  longTextProfileData,
  noPushProfileData,
  noStatusProfileData,
  sampleProfileData,
  sparseProfileData,
  worstCaseProfileData,
} from "./sampleProfileData.js";

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

/** The templates whose header reads the status: the others have no status golden, it would repeat the header. */
const statusHeaders: readonly ProfileTemplate[] = ["horizon", "pinscreen"];

/** The templates whose header reads the pushes. */
const pushHeaders: readonly ProfileTemplate[] = ["pinscreen", "year-ring"];

/** The templates whose header fits the location by drawn width, pinned with GitHub's longest values. */
const locationHeaders: readonly ProfileTemplate[] = ["year-ring"];

/** The sections that fit long names, messages and descriptions to their boxes, pinned with realistic long texts. */
const longTextSections: Readonly<Partial<Record<ProfileTemplate, readonly ProfileSection[]>>> = {
  "year-ring": ["recent", "repo-1"],
};

/** 64 characters of a real place name, and 255 (GitHub's limit) of the widest capital. */
const longLocation = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, Wales";
const wideLocation = "W".repeat(255);

/** A frame mid-animation of one section per template, so the motion itself is pinned, not only its end state. */
const frames: Readonly<Record<ProfileTemplate, readonly [ProfileSection, number]>> = {
  "year-ring": ["year", 15000],
  horizon: ["ticker", 5000],
  pinscreen: ["year", 3000],
};

/** The sample data with emoji in the name, bio, status and latest push: no template font covers them, so they are dropped. */
function emojiProfileData(): ReturnType<typeof sampleProfileData> {
  const data = sampleProfileData();
  return {
    github: {
      ...data.github,
      name: `${data.github.name ?? data.github.login} \u{1F680}`,
      bio: "Having fun \u{1F377}",
      pushes: data.github.pushes.map((push, index) =>
        index === 0 ? { ...push, message: "Fix \u{1F41B} in the parser \u{1F680}" } : push,
      ),
      status: {
        emoji: "\u{1F680}",
        message:
          "Shipping \u{1F469}\u200D\u{1F4BB} \u{1F1E8}\u{1F1FF} \u{1F44D}\u{1F3FD} 1\uFE0F\u20E3 \u2764\uFE0F",
      },
    },
  };
}

/**
 * The golden suite of one profile template: every section in both themes with the example's personal texts, the
 * long ones on worst-case data, the year on a sparse, spiky calendar, the sections with personal texts left empty,
 * the header with emoji no template font covers in the name, bio, status and latest push (each emoji is dropped and
 * takes no space; the spaces written between them stay, so the status shows "Shipping", four spaces and the keycap's
 * "1"), and a mid frame.
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
  const emojiData = emojiProfileData();
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
      ...themes.map((theme) => ({
        name: `header-emoji-${theme}`,
        input: render("header", theme, {
          design: loadProfile(template, "header", theme),
          data: emojiData,
          expectWarnings: ["missing-glyph"],
        }),
      })),
      ...(statusHeaders.includes(template) ? themes : []).map((theme) => ({
        name: `header-no-status-${theme}`,
        input: render("header", theme, { data: noStatusProfileData() }),
      })),
      ...(pushHeaders.includes(template) ? themes : []).map((theme) => ({
        name: `header-no-push-${theme}`,
        input: render("header", theme, { data: noPushProfileData() }),
      })),
      ...(locationHeaders.includes(template) ? themes : []).map((theme) => ({
        name: `header-long-location-${theme}`,
        input: render("header", theme, { data: longLocationProfileData(longLocation) }),
      })),
      ...(locationHeaders.includes(template) ? (["light"] as const) : []).map((theme) => ({
        name: `header-wide-location-${theme}`,
        input: render("header", theme, { data: longLocationProfileData(wideLocation) }),
      })),
      ...(longTextSections[template] ?? []).flatMap((section) =>
        themes.map((theme) => ({
          name: `${section}-long-text-${theme}`,
          input: render(section, theme, { data: longTextProfileData() }),
        })),
      ),
      {
        name: `${frameSection}-t${String(frameTime)}`,
        input: render(frameSection, "light", { time: frameTime }),
      },
    ],
  });
}
