/*
 * JJ - Excel in Dataverse - hero screenshot.
 * A tight frame where the grid is nearly full, for the README / pcf.gallery.
 */
import { test } from "@playwright/test";

test("hero screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 640 });
  await page.goto("/?demo=1");
  await page.waitForSelector(".jj-sheet-row");
  // A couple of edits so the dirty markers and pending count show the control
  // is live, not a static table.
  await page.locator('[data-row="0"][data-col="0"]').click();
  await page.keyboard.press("Enter");
  await page.getByLabel("Account").fill("Acme Corporation NV");
  await page.getByLabel("Account").press("Enter");
  await page.locator('[data-row="2"][data-col="2"]').click();
  await page.locator('[data-row="4"][data-col="3"]').click({ modifiers: ["Shift"] });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "media/screenshot.png" });
});
