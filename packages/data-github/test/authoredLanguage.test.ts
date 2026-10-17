import { describe, expect, test } from "vitest";
import { authoredLanguage } from "../src/authoredLanguage.js";
import { AUTHORED_EXTENSIONS, AUTHORED_FILE_NAMES } from "../src/authoredLanguageTable.js";

describe("authoredLanguage", () => {
  test.each([...AUTHORED_EXTENSIONS])("%s maps to its table row", (extension, language) => {
    expect(authoredLanguage(`src/main/File${extension}`)).toEqual(language);
    expect(authoredLanguage(`src/main/FILE${extension.toUpperCase()}`)).toEqual(language);
  });

  test.each([...AUTHORED_FILE_NAMES])(
    "the file name %s maps to its table row",
    (name, language) => {
      expect(authoredLanguage(name)).toEqual(language);
      expect(authoredLanguage(`docker/${name}`)).toEqual(language);
    },
  );

  test("Kotlin script files are Kotlin", () => {
    expect(authoredLanguage("app/build.gradle.kts")?.name).toBe("Kotlin");
    expect(authoredLanguage("settings.gradle")?.name).toBe("Gradle");
  });

  test.each([
    "node_modules/left-pad/index.js",
    "web/dist/app.js",
    "build/classes/Main.java",
    "out/Main.kt",
    "target/classes/A.java",
    "vendor/lib/a.go",
    "third_party/x/a.c",
    ".gradle/caches/a.kt",
    "src/__snapshots__/a.ts",
    "golden/a.ts",
    "src/generated/Api.kt",
    "a/Node_Modules/b.js",
    "pnpm-lock.yaml",
    "package-lock.json",
    "Cargo.lock",
    "yarn.lock",
    "gradle/wrapper/gradle-wrapper.properties",
    "gradle-wrapper.jar",
    "app.min.js",
    "style.min.css",
    "app.js.map",
    "a.test.snap",
    "types/index.d.ts",
    "logo.png",
    "photo.JPG",
    "icon.svg",
    "font.woff2",
    "font.ttf",
  ])("%s is excluded", (path) => {
    expect(authoredLanguage(path)).toBeNull();
  });

  test("a directory name is excluded only as a whole segment", () => {
    expect(authoredLanguage("src/buildSrc/Plugin.kt")?.name).toBe("Kotlin");
    expect(authoredLanguage("src/distance/Metric.kt")?.name).toBe("Kotlin");
    expect(authoredLanguage("out.kt")?.name).toBe("Kotlin");
  });

  test.each([
    "README.md",
    "data.json",
    "config.yaml",
    "notes.txt",
    "a.h",
    "Makefile.am",
    "noext",
    ".kt",
    "a.unknown",
  ])("%s is unknown and ignored", (path) => {
    expect(authoredLanguage(path)).toBeNull();
  });

  test("names that look like Object properties are unknown", () => {
    expect(authoredLanguage("__proto__")).toBeNull();
    expect(authoredLanguage("constructor.constructor")).toBeNull();
  });
});
