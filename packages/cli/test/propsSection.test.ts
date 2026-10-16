import { expect, test } from "vitest";
import { propsSection } from "../src/index.js";

test.each([
  ["header.json", "header"],
  ["header.dark.json", "header"],
  ["Header.DARK.yaml", "Header"],
  ["a/b/repo-1.yml", "repo-1"],
  ["a/b/repo-1.dark.yml", "repo-1"],
  [".dark.json", ".dark"],
  ["noextension", "noextension"],
])("%s is the section %s", (file, section) => {
  expect(propsSection(file)).toBe(section);
});
