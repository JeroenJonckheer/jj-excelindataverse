// JJ - Excel in Dataverse
// Author: Jeroen Jonckheer
// License: MIT

import eslintjs from "@eslint/js";
import microsoftPowerApps from "@microsoft/eslint-plugin-power-apps";
import pluginPromise from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "**/generated/**",
      "**/out/**",
      "**/dist/**",
      "**/node_modules/**",
      "solution/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "harness/dist/**",
      "media/**",
    ],
  },
  // Register the Power Apps plugin globally so its rules resolve for every
  // linted file, including the JavaScript config and build scripts.
  {
    plugins: {
      "@microsoft/power-apps": microsoftPowerApps,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  eslintjs.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...typescriptEslint.configs.stylistic,
  pluginPromise.configs["flat/recommended"],
  microsoftPowerApps.configs.paCheckerHosted,
  reactPlugin.configs.flat.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@microsoft/power-apps": microsoftPowerApps,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ComponentFramework: true,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "promise/catch-or-return": ["error", { "terminationMethod": ["catch", "finally"] }],
      "promise/always-return": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": "off",
      "react/prop-types": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: [
      "test/**/*.ts",
      "test/**/*.tsx",
      "harness/**/*.ts",
      "harness/**/*.js",
      "e2e/**/*.ts",
      "*.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // The harness, e2e setup and config files are Node CommonJS scripts.
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
];
