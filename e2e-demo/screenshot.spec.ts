/*
 * JJ - Excel in Dataverse - hero screenshot.
 * A tight frame where the grid is nearly full, for the README / pcf.gallery.
 */
import { test } from "@playwright/test";

test("hero screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 640 });
  await page.goto("/?demo=1");
  await page.waitForSelector(".jj-sheet-row");

  // An inline edit (City is a text column) so a dirty marker and the pending
  // count show the control is live, plus a range selection for the aggregates.
  await page.locator('[data-row="0"][data-col="3"]').click();
  await page.keyboard.type("Amsterdam");
  await page.keyboard.press("Enter");
  await page.locator('[data-row="0"][data-col="5"]').click();
  await page.locator('[data-row="4"][data-col="5"]').click({ modifiers: ["Shift"] });
  await page.waitForTimeout(700);

  await page.screenshot({ path: "media/screenshot.png" });
});
