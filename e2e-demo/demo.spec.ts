/*
 * JJ - Excel in Dataverse - demo choreography.
 * Shows the spreadsheet's headline features slowly enough to read on video:
 * inline edit, choice dropdown, range select + copy, fill handle, paste from
 * Excel (the killer feature), move a block, find, sort, save.
 */
import { test, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

async function editCell(page: Page, row: number, col: number, label: string, value: string) {
  await cell(page, row, col).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("Enter");
  const input = page.getByLabel(label);
  await input.fill(value);
  await page.waitForTimeout(250);
  await input.press("Enter");
  await page.waitForTimeout(450);
}

// A visible, stepped drag from one element to a target cell.
async function slowDrag(page: Page, fromSel: string, row: number, col: number) {
  const from = await page.locator(fromSel).boundingBox();
  const to = await cell(page, row, col).boundingBox();
  if (!from || !to) return;
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  await page.mouse.move(sx, sy, { steps: 6 });
  await page.mouse.down();
  await page.mouse.move(sx, sy + 8, { steps: 6 });
  await page.waitForTimeout(180);
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 30 });
  await page.mouse.move(tx, ty, { steps: 30 });
  await page.waitForTimeout(320);
  await page.mouse.up();
  await page.waitForTimeout(550);
}

async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => value },
    });
    grid.dispatchEvent(event);
  }, text);
}

test("demo", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.waitForSelector(".jj-sheet-row");
  await page.waitForTimeout(1400); // HOOK: full board settles

  // 1. Inline edit a text cell.
  await editCell(page, 0, 0, "Account", "Acme Corporation NV");

  // 2. Choice column edits with a single-click dropdown.
  await cell(page, 1, 3).click();
  await page.waitForTimeout(300);
  try {
    await page.getByLabel("Status").selectOption({ label: "Won" });
  } catch {
    /* leave as-is if the option set differs */
  }
  await page.waitForTimeout(600);

  // 3. Rectangular selection -> the status bar shows count / sum / average.
  await cell(page, 2, 2).click();
  await cell(page, 6, 2).click({ modifiers: ["Shift"] });
  await page.waitForTimeout(700);
  await page.keyboard.press("Control+c"); // marching-ants marquee
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 4. Fill handle: extend a number down as a series.
  await cell(page, 0, 2).click();
  await page.waitForTimeout(300);
  try {
    await slowDrag(page, ".jj-sheet-fill-handle", 4, 2);
  } catch {
    /* fill handle geometry can vary headless */
  }

  // 5. Paste from Excel - the headline. Tabs and newlines become cells/rows,
  //    and a paste past the end adds rows.
  await cell(page, 12, 0).click();
  await page.waitForTimeout(300);
  await pasteText(
    page,
    "Northwind Traders\tinfo@northwind.example\nFabrikam\tsales@fabrikam.example\nContoso Ltd\thello@contoso.example",
  );
  await page.waitForTimeout(1100);

  // 6. Move a block by dragging its border.
  await cell(page, 8, 1).click();
  await cell(page, 10, 2).click({ modifiers: ["Shift"] });
  await page.waitForTimeout(500);
  try {
    await slowDrag(page, ".jj-sheet-move-left", 5, 1);
  } catch {
    /* move band geometry can vary headless */
  }

  // 7. Find highlights matches across the grid.
  await page.keyboard.press("Control+f");
  await page.waitForTimeout(300);
  await page.getByLabel("Find").fill("Cyberdyne");
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 8. Sort by clicking a column header.
  await page.getByRole("columnheader", { name: "Score" }).click();
  await page.waitForTimeout(900);

  // 9. Save the pending changes back (committed in the in-memory store).
  const save = page.getByRole("button", { name: "Save changes" });
  if (await save.isEnabled()) {
    await save.click();
    await page.waitForTimeout(800);
  }

  await page.waitForTimeout(1600); // CLOSING HOLD (loop-friendly)
});
