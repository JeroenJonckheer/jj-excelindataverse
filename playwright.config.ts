/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry to absorb the occasional flake in the geometry/drag-based specs
  // (boundingBox + rAF timing); a genuine failure still fails both attempts.
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  globalSetup: "./e2e/globalSetup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
