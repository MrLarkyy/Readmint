import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/**", "**/coverage/**", "pnpm-lock.yaml"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Designs are untrusted: nothing in the repository may turn a string into code.
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
    },
  },
);
