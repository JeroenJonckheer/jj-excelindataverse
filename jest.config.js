/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/test"],
  setupFilesAfterEnv: ["<rootDir>/test/setupTests.ts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@fluentui/react-components$": "<rootDir>/test/fluentMock.tsx",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  collectCoverageFrom: [
    "Spreadsheet/**/*.{ts,tsx}",
    "!Spreadsheet/generated/**",
    "!Spreadsheet/index.ts",
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
};
