/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { test, expect, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
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
  await cell(page, 0, 0).dblclick();
  const input = page.getByLabel("Account");
  await input.fill("Acme Holdings");
  await input.press("Enter");
  await expect(cell(page, 0, 0)).toContainText("Acme Holdings");
  await expect(page.getByText(/1 pending change\b/)).toBeVisible();
});

test("changes a choice value with the dropdown", async ({ page }) => {
  await cell(page, 1, 3).dblclick();
  const select = page.getByLabel("Status");
  await select.selectOption({ label: "Won" });
  await select.press("Enter");
  await expect(cell(page, 1, 3)).toContainText("Won");
});

test("offers lookup autocomplete and selects an existing record", async ({ page }) => {
  await cell(page, 0, 6).dblclick();
  const input = page.getByLabel("Owner");
  await input.fill("Mary");
  await expect(page.getByRole("option", { name: "Mary Major" })).toBeVisible();
  await page.getByRole("option", { name: "Mary Major" }).click();
  await expect(cell(page, 0, 6)).toContainText("Mary Major");
});

test("blocks invalid input and disables saving", async ({ page }) => {
  await cell(page, 0, 2).dblclick();
  const input = page.getByLabel("Score");
  await input.fill("250");
  await input.press("Enter");
  await expect(cell(page, 0, 2)).toHaveClass(/jj-sheet-td-invalid/);
  await expect(page.getByText("Value must be at most 100.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("pastes a column from the clipboard down several rows", async ({ page }) => {
  await cell(page, 0, 0).click();
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "Northwind\nContoso\nUmbrella" },
    });
    grid.dispatchEvent(event);
  });
  await expect(cell(page, 0, 0)).toContainText("Northwind");
  await expect(cell(page, 1, 0)).toContainText("Contoso");
  await expect(cell(page, 2, 0)).toContainText("Umbrella");
  await expect(page.getByText(/3 pending changes/)).toBeVisible();
});

test("saves pending changes back to the data source", async ({ page }) => {
  await cell(page, 0, 0).dblclick();
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
  const newCell = cell(page, 5, 0);
  await newCell.dblclick();
  const input = page.getByLabel("Account");
  await input.fill("Brand New BV");
  await input.press("Enter");
  await expect(newCell).toContainText("Brand New BV");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await expect(page.getByText("Brand New BV")).toBeVisible();
});

test("resolves a pasted lookup name to an existing record", async ({ page }) => {
  await cell(page, 0, 6).click();
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "Mary Major" },
    });
    grid.dispatchEvent(event);
  });
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
