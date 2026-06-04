/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 *
 * Adversarial / destructive end-to-end suite. These tests behave like a hostile
 * power user: special characters, HTML/script/SQL-like input, rapid clicking,
 * undo/redo spam, malformed clipboard, copy immutability and resize. They are
 * part of `npm run verify`, so "test everything" re-runs them. Add new attacks
 * here.
 */
import { test, expect, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

async function editCell(page: Page, row: number, col: number, value: string) {
  await cell(page, row, col).click();
  await page.keyboard.press("Enter");
  const input = page.getByLabel("Account");
  await input.fill(value);
  await input.press("Enter");
}

// Dispatch a paste with explicit text/html and text/plain flavours.
async function paste(page: Page, opts: { text?: string; html?: string }) {
  await page.evaluate((o) => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/html" ? o.html ?? "" : o.text ?? "",
      },
    });
    grid.dispatchEvent(event);
  }, opts);
}

// Fail the test if any of these hostile inputs ever triggers a dialog (alert)
// or sets a global - i.e. if injected script ever executes.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  page.on("dialog", (d) => {
    // Record and dismiss; an assertion below checks none fired.
    void page.evaluate(() => ((window as unknown as { __dialog?: boolean }).__dialog = true));
    void d.dismiss();
  });
});

test("treats HTML/script/SQL-like text as literal data, never executing it", async ({
  page,
}) => {
  const hostile = `<img src=x onerror="window.__xss=true">`;
  await editCell(page, 0, 0, hostile);
  await expect(cell(page, 0, 0)).toHaveText(hostile); // shown verbatim, escaped
  const xss = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(xss).toBeFalsy();

  const sqlish = `Robert'); DROP TABLE accounts;--`;
  await editCell(page, 1, 0, sqlish);
  await expect(cell(page, 1, 0)).toHaveText(sqlish);
});

test("pastes an HTML table with a script/img payload as inert text", async ({ page }) => {
  await cell(page, 0, 0).click();
  await paste(page, {
    html: `<table><tr><td>hello<script>window.__xss=true</script></td><td><img src=x onerror="window.__xss=true"></td></tr></table>`,
    text: "fallback",
  });
  const xss = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(xss).toBeFalsy();
  // The first cell took the table's text content; nothing executed.
  await expect(cell(page, 0, 0)).toContainText("hello");
  const dialog = await page.evaluate(() => (window as unknown as { __dialog?: boolean }).__dialog);
  expect(dialog).toBeFalsy();
});

test("handles unicode and emoji as a normal edit", async ({ page }) => {
  const value = "Ünïcödé 日本語 😀🚀 café";
  await editCell(page, 0, 0, value);
  await expect(cell(page, 0, 0)).toHaveText(value);
  await expect(page.getByText(/1 pending change/)).toBeVisible();
});

test("flags text past the column max length as invalid and blocks saving", async ({
  page,
}) => {
  await editCell(page, 0, 0, "x".repeat(2000)); // name maxLength is 100
  await expect(cell(page, 0, 0)).toHaveClass(/jj-sheet-td-invalid/);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("an empty / whitespace / malformed clipboard paste does not break the grid", async ({
  page,
}) => {
  await cell(page, 0, 0).click();
  await paste(page, { text: "", html: "" });
  await paste(page, { text: "   \t  \r\n  " });
  await paste(page, { html: "<table><tr><td>" }); // malformed, unterminated
  // The grid is still alive and the first row still renders.
  await expect(cell(page, 0, 0)).toBeVisible();
});

test("copying a range never marks the data as changed", async ({ page }) => {
  await cell(page, 0, 0).click();
  await cell(page, 2, 1).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await expect(page.getByText(/No pending changes/)).toBeVisible();
});

test("rapid undo/redo spam keeps the state consistent and does not crash", async ({
  page,
}) => {
  await editCell(page, 0, 0, "First Edit");
  await expect(page.getByText(/1 pending change/)).toBeVisible();
  const grid = page.getByRole("grid");
  for (let i = 0; i < 12; i++) {
    await grid.press("Control+z");
    await grid.press("Control+y");
  }
  // Land on a defined state (redo wins last): the edit is present and counted once.
  await expect(cell(page, 0, 0)).toHaveText("First Edit");
  await expect(page.getByText(/1 pending change/)).toBeVisible();
  // Undo once more removes it cleanly.
  await grid.press("Control+z");
  await expect(page.getByText(/No pending changes/)).toBeVisible();
});

test("a fast double-click on Save does not submit twice", async ({ page }) => {
  await editCell(page, 0, 0, "Save Once BV");
  const save = page.getByRole("button", { name: "Save changes" });
  await Promise.all([save.click(), save.click().catch(() => undefined)]);
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __jjBatchCalls?: number }).__jjBatchCalls ?? 0,
  );
  expect(calls).toBeLessThanOrEqual(1);
});

test("edit -> undo -> redo restores exactly the edited value", async ({ page }) => {
  await editCell(page, 0, 0, "Roundtrip BV");
  const grid = page.getByRole("grid");
  await grid.press("Control+z");
  await expect(cell(page, 0, 0)).not.toHaveText("Roundtrip BV");
  await expect(page.getByText(/No pending changes/)).toBeVisible();
  await grid.press("Control+y");
  await expect(cell(page, 0, 0)).toHaveText("Roundtrip BV");
  await expect(page.getByText(/1 pending change/)).toBeVisible();
});

test("paste -> undo removes the pasted rows and values", async ({ page }) => {
  await cell(page, 0, 0).click();
  await paste(page, { text: "Pasted A\nPasted B\nPasted C" });
  await expect(cell(page, 0, 0)).toHaveText("Pasted A");
  await page.getByRole("grid").press("Control+z");
  await expect(cell(page, 0, 0)).not.toHaveText("Pasted A");
  await expect(page.getByText(/No pending changes/)).toBeVisible();
});

test("the grid keeps rendering rows across a viewport resize", async ({ page }) => {
  await expect(cell(page, 0, 0)).toBeVisible();
  await page.setViewportSize({ width: 600, height: 500 });
  await expect(cell(page, 0, 0)).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(cell(page, 0, 0)).toBeVisible();
});
