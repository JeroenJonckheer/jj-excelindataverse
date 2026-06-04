/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { test, expect, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

// Editing starts with a single click then Enter (double-click opens the record).
async function startEdit(page: Page, row: number, col: number) {
  await cell(page, row, col).click();
  await page.keyboard.press("Enter");
}

function pasteInto(page: Page, text: string) {
  return page.evaluate((value) => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => value },
    });
    grid.dispatchEvent(event);
  }, text);
}

// Dispatches a copy event with a recording clipboardData and returns what the
// control wrote, so we can assert the copied TSV/HTML without OS clipboard.
function copySelection(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const data: Record<string, string> = {};
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { setData: (type: string, value: string) => (data[type] = value) },
    });
    grid.dispatchEvent(event);
    return data;
  });
}

// Drags from the centre of one cell to another, holding the primary button so
// the selection extends the way a real drag does.
async function dragCells(page: Page, from: [number, number], to: [number, number]) {
  const a = await cell(page, from[0], from[1]).boundingBox();
  const b = await cell(page, to[0], to[1]).boundingBox();
  if (!a || !b) throw new Error("cell not found for drag");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(cell(page, 0, 0)).toContainText("Acme Corporation");
});

test("renders the view as a grid with headers, values and version", async ({ page }) => {
  await expect(page.getByRole("columnheader", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(cell(page, 2, 0)).toContainText("Initech");
  await expect(page.getByText(/JJ - Excel in Dataverse v\d+\.\d+\.\d+/)).toBeVisible();
});

test("edits a text cell and tracks the pending change", async ({ page }) => {
  await startEdit(page, 0, 0);
  const input = page.getByLabel("Account");
  await input.fill("Acme Holdings");
  await input.press("Enter");
  await expect(cell(page, 0, 0)).toContainText("Acme Holdings");
  await expect(page.getByText(/1 pending change\b/)).toBeVisible();
});

test("opens the choice dropdown on a single click", async ({ page }) => {
  await cell(page, 1, 3).click();
  await page.getByLabel("Status").selectOption({ label: "Won" });
  await expect(cell(page, 1, 3)).toContainText("Won");
});

test("offers lookup autocomplete and selects an existing record", async ({ page }) => {
  await startEdit(page, 0, 6);
  const input = page.getByLabel("Owner");
  await input.fill("Mary");
  await expect(page.getByRole("option", { name: "Mary Major" })).toBeVisible();
  await page.getByRole("option", { name: "Mary Major" }).click();
  await expect(cell(page, 0, 6)).toContainText("Mary Major");
});

test("clears the pending mark when a cell is set back to its original value", async ({ page }) => {
  await startEdit(page, 0, 0);
  await page.getByLabel("Account").fill("Temporary");
  await page.getByLabel("Account").press("Enter");
  await expect(page.getByText(/1 pending change/)).toBeVisible();
  await startEdit(page, 0, 0);
  await page.getByLabel("Account").fill("Acme Corporation");
  await page.getByLabel("Account").press("Enter");
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await expect(cell(page, 0, 0)).not.toHaveClass(/jj-sheet-td-dirty/);
});

test("blocks invalid input and disables saving", async ({ page }) => {
  await startEdit(page, 0, 2);
  const input = page.getByLabel("Score");
  await input.fill("250");
  await input.press("Enter");
  await expect(cell(page, 0, 2)).toHaveClass(/jj-sheet-td-invalid/);
  await expect(page.getByText("Value must be at most 100.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("pastes a column from the clipboard down several rows", async ({ page }) => {
  await cell(page, 0, 0).click();
  await pasteInto(page, "Northwind\nContoso\nUmbrella");
  await expect(cell(page, 0, 0)).toContainText("Northwind");
  await expect(cell(page, 1, 0)).toContainText("Contoso");
  await expect(cell(page, 2, 0)).toContainText("Umbrella");
  await expect(page.getByText(/3 pending changes/)).toBeVisible();
});

test("saves pending changes back to the data source", async ({ page }) => {
  await startEdit(page, 0, 0);
  const input = page.getByLabel("Account");
  await input.fill("Acme Worldwide");
  await input.press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await expect(cell(page, 0, 0)).toContainText("Acme Worldwide");
});

test("grows the grid with ArrowDown and creates the new record on save", async ({ page }) => {
  await cell(page, 4, 0).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const input = page.getByLabel("Account");
  await input.fill("Brand New BV");
  await input.press("Enter");
  await expect(cell(page, 5, 0)).toContainText("Brand New BV");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await expect(page.getByText("Brand New BV")).toBeVisible();
});

test("resolves a pasted lookup name to an existing record", async ({ page }) => {
  await cell(page, 0, 6).click();
  await pasteInto(page, "Mary Major");
  await expect(cell(page, 0, 6)).toContainText("Mary Major");
  await expect(cell(page, 0, 6)).not.toHaveClass(/jj-sheet-td-invalid/);
});

test("navigates between cells with the keyboard", async ({ page }) => {
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 0, 1)).toHaveClass(/jj-sheet-td-active/);
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 1, 1)).toHaveClass(/jj-sheet-td-active/);
});

test("selects a row and deletes it on save", async ({ page }) => {
  const row = page.locator("tr", { hasText: "Acme Corporation" }).first();
  await row.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: /Delete selected/ }).click();
  await expect(row).toHaveClass(/jj-sheet-row-delete/);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await expect(page.getByText("Acme Corporation")).toHaveCount(0);
});

test("Shift+click on the checkboxes selects the whole range of rows", async ({
  page,
}) => {
  const checkboxes = page.locator('tbody tr[data-record-id] input[type="checkbox"]');
  await checkboxes.nth(0).click();
  await checkboxes.nth(3).click({ modifiers: ["Shift"] });
  // Rows 0-3 (inclusive) are now selected; row 4 is not.
  const rows = page.locator("tbody tr[data-record-id]");
  for (let i = 0; i <= 3; i++) {
    await expect(rows.nth(i)).toHaveClass(/jj-sheet-row-selected/);
  }
  await expect(rows.nth(4)).not.toHaveClass(/jj-sheet-row-selected/);
});

test("sorts the grid when a column header is clicked", async ({ page }) => {
  // Ascending by Score puts the lowest score (Hooli, 15) first.
  await page.getByRole("columnheader", { name: "Score" }).click();
  await expect(cell(page, 0, 0)).toContainText("Hooli");
});

// ---- Brok E1: column reorder and auto-fit ----

test("reorders columns by dragging a header", async ({ page }) => {
  // Drag Owner (col 6) onto Account (col 0); Owner becomes the first column.
  await page
    .getByRole("columnheader", { name: "Owner" })
    .dragTo(page.getByRole("columnheader", { name: "Account" }));
  await expect(cell(page, 0, 0)).toContainText("Jane Doe");
});

test("auto-fits a column on double-clicking its border", async ({ page }) => {
  await startEdit(page, 0, 0);
  await page.getByLabel("Account").fill("A very very very long account name indeed");
  await page.getByLabel("Account").press("Enter");
  await page.locator("thead th").nth(1).locator(".jj-sheet-resize-handle").dblclick();
  const fits = await cell(page, 0, 0)
    .locator(".jj-sheet-cell-text")
    .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});

test("freezes pinned columns when scrolling horizontally", async ({ page }) => {
  // Pin the Account column from its header (nothing is frozen by default).
  const accountHeader = page.getByRole("columnheader", { name: "Account" });
  await accountHeader.hover();
  await accountHeader.locator(".jj-sheet-pin").click();

  // Widen the Score column so the grid overflows horizontally.
  const handle = page.locator("thead th").nth(3).locator(".jj-sheet-resize-handle");
  const box = await handle.boundingBox();
  if (!box) throw new Error("no resize handle");
  await page.mouse.move(box.x + 3, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 5, { steps: 8 });
  await page.mouse.up();

  const frozenBefore = await cell(page, 0, 0).boundingBox();
  const farBefore = await cell(page, 0, 5).boundingBox();
  await page.locator(".jj-sheet").evaluate((el) => {
    el.scrollLeft = 400;
  });
  await page.waitForTimeout(50);
  const frozenAfter = await cell(page, 0, 0).boundingBox();
  const farAfter = await cell(page, 0, 5).boundingBox();

  // The far column scrolled left (the scroll really happened)...
  expect((farAfter?.x ?? 0)).toBeLessThan((farBefore?.x ?? 0) - 100);
  // ...but the first column stayed put (frozen).
  expect(Math.abs((frozenAfter?.x ?? 0) - (frozenBefore?.x ?? 0))).toBeLessThan(2);
});

test("renders rows when a read-only datetime is the first column", async ({ page }) => {
  await page.goto("/?firstcol=createdon");
  // The grid must not go blank: rows render, with the date in col 0 and the
  // account name in col 1.
  await expect(cell(page, 0, 0)).not.toHaveText("");
  await expect(cell(page, 0, 1)).toContainText("Acme Corporation");
});

test("virtualizes a large grid and renders rows on scroll", async ({ page }) => {
  await page.goto("/?rows=200&pageSize=200");
  await expect(cell(page, 0, 0)).toContainText("Synthetic Account 0");
  // Not all 200 rows are in the DOM (virtualized).
  expect(await page.locator("tbody tr[data-record-id]").count()).toBeLessThan(200);
  await expect(page.getByText("Synthetic Account 190", { exact: true })).toHaveCount(0);
  // Scrolling to the bottom renders the later rows.
  await page.locator(".jj-sheet").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByText("Synthetic Account 199", { exact: true })).toBeVisible();
});

test("keeps rows visible when scrolled far past the content", async ({ page }) => {
  await page.goto("/?rows=200&pageSize=200");
  await expect(cell(page, 0, 0)).toContainText("Synthetic Account 0");
  // An oversized scrollTop (much larger than the content) must not blank the
  // grid: the window clamps to the last full page of rows.
  await page.locator(".jj-sheet").evaluate((el) => {
    el.scrollTop = el.scrollHeight * 10;
  });
  await expect(page.locator("tbody tr[data-record-id]").first()).toBeVisible();
  await expect(page.getByText("Synthetic Account 199", { exact: true })).toBeVisible();
});

// ---- Brok G: dataset paging ----

test("loads more records with the footer", async ({ page }) => {
  // A small page size (via the harness URL) leaves more to load.
  await page.goto("/?pageSize=2");
  await expect(cell(page, 0, 0)).toContainText("Acme Corporation");
  await expect(cell(page, 2, 0)).toHaveCount(0); // only two rows loaded
  await expect(page.getByLabel("Loaded rows")).toContainText(/1.2 of 5/);
  await page.getByRole("button", { name: "Load more rows" }).click();
  // The set grew (accumulated): row 2 is now loaded, and the first row stays put.
  await expect(cell(page, 0, 0)).toContainText("Acme Corporation");
  await expect(cell(page, 2, 0)).toContainText("Initech");
  await expect(page.getByLabel("Loaded rows")).toContainText(/1.4 of 5/);
});

// ---- Brok F: find and replace ----

test("finds matches with Ctrl+F", async ({ page }) => {
  await page.keyboard.press("Control+f");
  await page.getByLabel("Find").fill("Corporation");
  await expect(page.getByLabel("Match count")).toContainText("1/1");
  await expect(cell(page, 0, 0)).toHaveClass(/jj-sheet-td-match/);
});

test("replaces text as a pending edit with Ctrl+H", async ({ page }) => {
  await page.keyboard.press("Control+h");
  await page.getByLabel("Find").fill("Corporation");
  await page.getByLabel("Replace with").fill("Corp");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(cell(page, 0, 0)).toContainText("Acme Corp");
  await expect(page.getByText(/1 pending change/)).toBeVisible();
});

test("opens the record on double-click", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (m) => messages.push(m.text()));
  await cell(page, 0, 0).dblclick();
  await expect
    .poll(() => messages.some((t) => t.includes("open record")))
    .toBeTruthy();
});

// ---- Brok A: range selection, copy, aggregates, range delete ----

test("selects a range with shift+click and frames the whole block", async ({ page }) => {
  await cell(page, 0, 1).click();
  await cell(page, 2, 2).click({ modifiers: ["Shift"] });
  // Every cell in the 3x2 rectangle is part of the selection.
  await expect(cell(page, 0, 1)).toHaveClass(/jj-sheet-td-selected/);
  await expect(cell(page, 2, 2)).toHaveClass(/jj-sheet-td-selected/);
  await expect(cell(page, 1, 1)).toHaveClass(/jj-sheet-td-selected/);
});

test("selects a range by dragging the mouse", async ({ page }) => {
  await dragCells(page, [0, 0], [2, 0]);
  await expect(cell(page, 0, 0)).toHaveClass(/jj-sheet-td-selected/);
  await expect(cell(page, 2, 0)).toHaveClass(/jj-sheet-td-selected/);
});

test("shows an Excel-style aggregate for a numeric selection", async ({ page }) => {
  // Score column (col 2): row 1 = 40, row 2 = 88.
  await cell(page, 1, 2).click();
  await cell(page, 2, 2).click({ modifiers: ["Shift"] });
  await expect(page.getByText(/Count 2.*Sum 128.*Average 64/)).toBeVisible();
});

test("copies the selected range as TSV and HTML", async ({ page }) => {
  await cell(page, 0, 0).click();
  await cell(page, 1, 0).click({ modifiers: ["Shift"] });
  const data = await copySelection(page);
  expect(data["text/plain"]).toBe("Acme Corporation\r\nGlobex");
  expect(data["text/html"]).toContain("<table>");
  // The copied range shows the marching-ants marquee.
  await expect(page.locator(".jj-sheet-marquee")).toBeVisible();
});

test("clears a selected range with Delete and stays responsive", async ({ page }) => {
  await cell(page, 0, 2).click();
  await cell(page, 1, 2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await expect(cell(page, 0, 2)).toHaveText("");
  await expect(cell(page, 1, 2)).toHaveText("");
  await expect(page.getByText(/2 pending changes/)).toBeVisible();
  // The grid is not stuck: a fresh click still selects another cell.
  await cell(page, 3, 0).click();
  await expect(cell(page, 3, 0)).toHaveClass(/jj-sheet-td-active/);
});

// ---- Brok B: fill handle ----

test("fills a value down with the fill handle", async ({ page }) => {
  await cell(page, 1, 2).click(); // Score = 40
  const handle = cell(page, 1, 2).locator(".jj-sheet-fill-handle");
  await expect(handle).toBeVisible();
  const h = await handle.boundingBox();
  const target = await cell(page, 3, 2).boundingBox();
  if (!h || !target) throw new Error("missing fill handle or target");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(cell(page, 2, 2)).toHaveText("40");
  await expect(cell(page, 3, 2)).toHaveText("40");
  // The whole resulting series is framed (selected), like Excel.
  await expect(cell(page, 1, 2)).toHaveClass(/jj-sheet-td-selected/);
  await expect(cell(page, 3, 2)).toHaveClass(/jj-sheet-td-selected/);
});

test("fills a numeric series with the fill handle", async ({ page }) => {
  // Make a clean 1, 2 series in the Score column.
  await startEdit(page, 0, 2);
  await page.getByLabel("Score").fill("1");
  await page.getByLabel("Score").press("Enter");
  await startEdit(page, 1, 2);
  await page.getByLabel("Score").fill("2");
  await page.getByLabel("Score").press("Enter");
  // Select both and drag the handle down two rows.
  await cell(page, 0, 2).click();
  await cell(page, 1, 2).click({ modifiers: ["Shift"] });
  const handle = cell(page, 1, 2).locator(".jj-sheet-fill-handle");
  const h = await handle.boundingBox();
  const target = await cell(page, 3, 2).boundingBox();
  if (!h || !target) throw new Error("missing fill handle or target");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(cell(page, 2, 2)).toHaveText("3");
  await expect(cell(page, 3, 2)).toHaveText("4");
});

// ---- Brok C: validation ----

test("does not let you edit a read-only (calculated) column", async ({ page }) => {
  // Forecast (col 7) is read-only, like a calculated/rollup field.
  await expect(cell(page, 0, 7)).toHaveClass(/jj-sheet-td-readonly/);
  await expect(cell(page, 0, 7)).toContainText("72500");
  await cell(page, 0, 7).click();
  await page.keyboard.press("Enter");
  // No editor opens for a read-only column.
  await expect(page.getByLabel("Forecast")).toHaveCount(0);
});

test("blocks saving a new row when a required field is empty", async ({ page }) => {
  // Add a new row and fill only the non-required Score, leaving Account empty.
  await cell(page, 4, 0).click();
  await page.keyboard.press("ArrowDown");
  await cell(page, 5, 2).click();
  await page.keyboard.press("Enter");
  await page.getByLabel("Score").fill("50");
  await page.getByLabel("Score").press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(cell(page, 5, 0)).toHaveClass(/jj-sheet-td-invalid/);
  await expect(page.getByText("This field is required.")).toBeVisible();
});

test("surfaces a server error inline when a save is rejected", async ({ page }) => {
  // The harness rejects saving the account named exactly "REJECT".
  await startEdit(page, 0, 0);
  await page.getByLabel("Account").fill("REJECT");
  await page.getByLabel("Account").press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Server refused this record")).toBeVisible();
  await expect(
    page.locator("tr", { hasText: "REJECT" }).first(),
  ).toHaveClass(/jj-sheet-row-error/);
});

// ---- Brok D: defaults on new rows and duplicate row ----

test("shows the metadata default value on a new row", async ({ page }) => {
  await cell(page, 4, 0).click();
  await page.keyboard.press("ArrowDown");
  // Status (col 3) shows its default option on the new row.
  await expect(cell(page, 5, 3)).toContainText("Lead");
});

test("duplicates a row from the context menu", async ({ page }) => {
  await cell(page, 0, 0).click({ button: "right" });
  await page.getByText("Duplicate row").click();
  // The new row at the bottom copies the source Account name.
  await expect(cell(page, 5, 0)).toContainText("Acme Corporation");
  await expect(page.getByText(/pending change/)).toBeVisible();
});
