import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Only generated output, dependencies, and platform scaffolding are ignored.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.d.ts",
      "lib/db/migrations/**",
      // Replit canvas mockup sandbox (platform tooling, not application code)
      "artifacts/mockup-sandbox/**",
      // Vendored/attached raw assets and local agent state
      "attached_assets/**",
      ".local/**",
      ".agents/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Frontend: browser globals + React hooks rules
    files: ["artifacts/dental-followup/src/**/*.{ts,tsx}", "lib/api-client-react/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Allow intentionally-unused args/vars when prefixed with underscore
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
