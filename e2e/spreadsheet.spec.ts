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

test("changes a choice value with the dropdown", async ({ page }) => {
  await startEdit(page, 1, 3);
  const select = page.getByLabel("Status");
  await select.selectOption({ label: "Won" });
  await select.press("Enter");
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

test("opens the record on double-click", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (m) => messages.push(m.text()));
  await cell(page, 0, 0).dblclick();
  await expect
    .poll(() => messages.some((t) => t.includes("open record")))
    .toBeTruthy();
});
