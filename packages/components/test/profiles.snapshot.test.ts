import { expect, test } from "vitest";
import { profileTemplates, type ProfileTemplate } from "../src/index.js";
import { loadProfile, renderProfile, type ProfileTheme } from "./profileDesigns.js";
import { stripFontData } from "./stripFontData.js";
import { sampleProfileData } from "./sampleProfileData.js";

const themes: readonly ProfileTheme[] = ["light", "dark"];
const cases = (Object.keys(profileTemplates) as ProfileTemplate[]).flatMap((template) =>
  profileTemplates[template].flatMap((section) =>
    themes.map((theme) => [template, section, theme] as const),
  ),
);

// A folder of its own: the golden suites' orphan check owns golden/profiles-<template>.
test.each(cases)(
  "the animated SVG of %s %s %s matches its snapshot",
  async (template, section, theme) => {
    const svg = stripFontData(
      renderProfile({
        template,
        design: loadProfile(template, section, theme),
        data: sampleProfileData(),
      }),
    );
    await expect(svg).toMatchFileSnapshot(
      `golden/profiles-${template}-svg/${section}-${theme}.svg`,
    );
  },
);
