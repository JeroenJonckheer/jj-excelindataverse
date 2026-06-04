/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 *
 * Records the demo video and the hero screenshot from the offline harness.
 * Run: npx playwright test --config=playwright.demo.config.ts
 * Then convert demo-output/.../video.webm to media/demo.gif (see docs/Demo.md).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const SIZE = { width: 1600, height: 900 };

export default defineConfig({
  testDir: "./e2e-demo",
  workers: 1,
  timeout: 120000,
  outputDir: "./demo-output",
  globalSetup: "./e2e-demo/globalSetup.ts",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: SIZE,
    video: { mode: "on", size: SIZE },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: SIZE },
    },
  ],
});
