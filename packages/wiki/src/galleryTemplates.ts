import type { GalleryTemplate } from "./GalleryTemplate.js";

const repos = ["repo-1", "repo-2", "repo-3", "repo-4", "repo-5", "repo-6"];

/** Every profile and starter template shown on the Gallery page, in page order. Tested against docs/components.md. */
export const galleryTemplates: readonly GalleryTemplate[] = [
  {
    name: "year-ring",
    title: "Year Ring",
    kind: "profile",
    description:
      "Calm and cobalt: a typed last push, an index table, recent work and repository cards with a 52-week line, around a turning 3D ring.",
    items: ["header", "year", "index", "recent", "work", ...repos, "footer"],
  },
  {
    name: "horizon",
    title: "Horizon",
    kind: "profile",
    description:
      "An orange poster: the name full width, a commit ticker, repositories ranked by stars, stack and worked with, over a lit 3D terrain.",
    items: ["header", "ticker", "year", "work", ...repos, "stack", "worked", "footer"],
  },
  {
    name: "pinscreen",
    title: "Pinscreen",
    kind: "profile",
    description:
      "An editor: a status bar, repositories as Kotlin objects, a terminal git log and a build script stack, over a wall of pins.",
    items: ["header", "year", "work", ...repos, "log", "stack", "footer"],
  },
  {
    name: "stats-card",
    title: "Stats card",
    kind: "starter",
    description: "Name and seven totals in two columns.",
    items: ["stats-card"],
  },
  {
    name: "isometric-card",
    title: "Isometric card",
    kind: "starter",
    description: "The year's total over the isometric calendar.",
    items: ["isometric-card"],
  },
  {
    name: "banner",
    title: "Banner",
    kind: "starter",
    description: "A wide banner: name in a display font, bio under it.",
    items: ["banner"],
  },
  {
    name: "language-bars",
    title: "Language bars",
    kind: "starter",
    description: "The six biggest languages as bars in their colours.",
    items: ["language-bars"],
  },
  {
    name: "profile-card",
    title: "Profile card",
    kind: "starter",
    description: "The showcase: name, stats, isometric calendar and streaks.",
    items: ["profile-card"],
  },
];
