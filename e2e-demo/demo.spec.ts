/*
 * JJ - Excel in Dataverse - narrated demo choreography.
 * A slow, readable walkthrough with a visible mouse cursor and English captions
 * (in a bottom strip, so nothing on the grid is covered) that name each feature.
 * The board uses the realistic lead schema (?demo=1): Account and Contact are
 * lookups (blue links), with editable text/number/choice/date columns.
 *
 * Columns: 0 Account(lookup) 1 Contact(lookup) 2 Company 3 City 4 Hours/week
 *          5 Rate 6 Status 7 Close date
 */
import { test, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

let pos = { x: 800, y: 420 };

async function installOverlay(page: Page) {
  await page.evaluate(() => {
    const root = document.getElementById("root");
    if (root) root.style.height = "calc(100vh - 86px)"; // free a caption strip
    const style = document.createElement("style");
    style.textContent = `
      #demo-cursor{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;
        margin:-2px 0 0 -2px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));}
      #demo-ring{position:fixed;z-index:2147483646;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;
        border:3px solid #0f6cbd;border-radius:50%;pointer-events:none;opacity:0;}
      #demo-ring.go{animation:demoRing .5s ease-out;}
      @keyframes demoRing{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(2.6)}}
      #demo-caption{position:fixed;z-index:2147483645;left:0;right:0;bottom:0;height:86px;
        display:flex;align-items:center;justify-content:center;text-align:center;
        background:#111827;color:#fff;font:600 27px/1.3 "Segoe UI",Arial,sans-serif;padding:0 28px;
        opacity:0;transition:opacity .35s;}
      #demo-caption.show{opacity:1;}
    `;
    document.head.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "demo-cursor";
    cur.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'>" +
      "<path d='M5 2.5 L5 19.5 L9.2 15.3 L12.2 21.5 L14.8 20.3 L11.8 14.2 L17.5 14.2 Z' " +
      "fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/></svg>";
    document.body.appendChild(cur);
    const ring = document.createElement("div");
    ring.id = "demo-ring";
    document.body.appendChild(ring);
    const cap = document.createElement("div");
    cap.id = "demo-caption";
    document.body.appendChild(cap);
    const w = window as unknown as { __say: (t: string) => void; __pulse: () => void };
    document.addEventListener(
      "mousemove",
      (e) => {
        cur.style.left = `${e.clientX}px`;
        cur.style.top = `${e.clientY}px`;
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
      },
      true,
    );
    w.__say = (t) => {
      cap.textContent = t;
      cap.classList.add("show");
    };
    w.__pulse = () => {
      ring.classList.remove("go");
      void ring.offsetWidth;
      ring.classList.add("go");
    };
  });
}

async function say(page: Page, text: string, ms = 3200) {
  await page.evaluate((t) => (window as unknown as { __say: (s: string) => void }).__say(t), text);
  await page.waitForTimeout(ms);
}

async function moveMouse(page: Page, x: number, y: number, ms = 800) {
  const steps = Math.max(12, Math.round(ms / 26));
  const from = { ...pos };
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((x - from.x) * i) / steps,
      from.y + ((y - from.y) * i) / steps,
    );
    await page.waitForTimeout(ms / steps);
  }
  pos = { x, y };
}

async function box(page: Page, row: number, col: number) {
  const b = await cell(page, row, col).boundingBox();
  if (!b) throw new Error(`cell ${row},${col} not found`);
  return b;
}

async function moveToCell(page: Page, row: number, col: number, ms = 800) {
  const b = await box(page, row, col);
  await moveMouse(page, b.x + b.width / 2, b.y + b.height / 2, ms);
  return b;
}

async function clickHere(page: Page) {
  await page.evaluate(() => (window as unknown as { __pulse: () => void }).__pulse());
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test("demo", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.waitForSelector(".jj-sheet-row");
  await installOverlay(page);
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(900);

  await say(page, "JJ - Excel in Dataverse: edit your Dataverse records inline, like a spreadsheet.", 3800);

  // Lookups are blue links (hover shows the underline).
  await say(page, "Account and Contact are lookups - blue links, like anywhere in Dynamics.", 3400);
  await moveToCell(page, 2, 0);
  await page.waitForTimeout(1100);

  // 1. Inline text edit that REPLACES the value.
  await say(page, "Click a cell and just type - it replaces the value, like a spreadsheet.", 3400);
  await moveToCell(page, 1, 3); // City = Rotterdam
  await clickHere(page);
  await page.keyboard.type("Amsterdam", { delay: 60 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await say(page, "The edited cell is marked as a pending change.", 2600);

  // 2. Lookup search with the magnifying glass (browse + pick, like Dataverse).
  await say(page, "Look up a record with the search button - browse and pick from the list.", 3800);
  await moveToCell(page, 3, 0); // Account cell
  await page.waitForTimeout(400);
  try {
    const glass = await cell(page, 3, 0).locator(".jj-sheet-lookup-search").boundingBox();
    if (glass) {
      await moveMouse(page, glass.x + glass.width / 2, glass.y + glass.height / 2, 600);
      await clickHere(page);
      await page.waitForTimeout(900);
      const opt = page.getByRole("option", { name: "Stark Industries" });
      const ob = await opt.boundingBox();
      if (ob) {
        await moveMouse(page, ob.x + ob.width / 2, ob.y + ob.height / 2, 700);
        await clickHere(page);
      }
    }
  } catch {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(1100);

  // 3. Choice field.
  await say(page, "Choice and Yes/No fields edit in place.", 3200);
  await moveToCell(page, 1, 6); // Status = Lead
  await clickHere(page);
  await page.waitForTimeout(300);
  try {
    await page.getByLabel("Status").selectOption({ label: "Qualified" });
  } catch {
    /* option set may differ */
  }
  await page.waitForTimeout(900);

  // 4. Range selection + footer aggregates.
  await say(page, "Select a range - the footer shows count, sum and average, like Excel.", 3600);
  await moveToCell(page, 0, 5); // Rate
  await clickHere(page);
  await moveToCell(page, 5, 5, 850);
  await page.keyboard.down("Shift");
  await clickHere(page);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(2200);

  // 5. Copy.
  await say(page, "Copy with Ctrl+C - ready to paste straight into Excel.", 3000);
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(1700);
  await page.keyboard.press("Escape");

  // 6. Fill a real series: 1, 2, 3 -> 4, 5, 6.
  await say(page, "Fill a series: select 1, 2, 3 and drag the handle to continue 4, 5, 6.", 4000);
  await moveToCell(page, 0, 4); // Hours = 1
  await clickHere(page);
  await moveToCell(page, 2, 4, 700); // Hours = 3
  await page.keyboard.down("Shift");
  await clickHere(page);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(700);
  try {
    const handle = await page.locator(".jj-sheet-fill-handle").boundingBox();
    if (handle) {
      await moveMouse(page, handle.x + handle.width / 2, handle.y + handle.height / 2, 450);
      await page.mouse.down();
      const t = await box(page, 5, 4);
      await moveMouse(page, t.x + t.width / 2, t.y + t.height / 2, 1300);
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(900);
    }
  } catch {
    /* fill geometry can vary headless */
  }

  // 7. Paste from Excel - complete records (the headline).
  await say(page, "Paste complete records from Excel: lookups resolve and new rows are created for you.", 4400);
  await moveToCell(page, 13, 0); // last row, Account column
  await clickHere(page);
  await page.keyboard.press("ArrowDown"); // a fresh row at the bottom
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () =>
          "Stark Industries\tRichard Miles\tStark Defense\tApeldoorn\t26\t125\n" +
          "Tyrell Corp\tJane Doe\tTyrell Bio\tHaarlem\t18\t95",
      },
    });
    grid.dispatchEvent(event);
  });
  await page.waitForTimeout(3000); // hold so the pasted lookups resolve to links

  // 8. Move a block by dragging its border.
  await say(page, "Move a block of cells by dragging its border.", 3400);
  await moveToCell(page, 8, 2);
  await clickHere(page);
  await moveToCell(page, 9, 3, 750);
  await page.keyboard.down("Shift");
  await clickHere(page);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(700);
  try {
    const band = await page.locator(".jj-sheet-move-left").boundingBox();
    if (band) {
      await moveMouse(page, band.x + band.width / 2, band.y + 10, 450);
      await page.mouse.down();
      const t = await box(page, 5, 2);
      await moveMouse(page, t.x + t.width / 2, t.y + t.height / 2, 1300);
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(900);
    }
  } catch {
    /* move band geometry can vary headless */
  }

  // 9. Find.
  await say(page, "Find anything across the grid with Ctrl+F.", 3200);
  await page.keyboard.press("Control+f");
  await page.waitForTimeout(400);
  await page.getByLabel("Find").fill("Stark");
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 10. Sort.
  await say(page, "Sort by clicking a column header.", 3000);
  const rateHeader = await page.getByRole("columnheader", { name: "Rate" }).boundingBox();
  if (rateHeader) {
    await moveMouse(page, rateHeader.x + rateHeader.width / 2, rateHeader.y + rateHeader.height / 2, 700);
    await clickHere(page);
  }
  await page.waitForTimeout(1500);

  // 11. Save.
  await say(page, "Save - every change is written back to Dataverse in one batch.", 3600);
  const save = page.getByRole("button", { name: "Save changes" });
  const saveBox = await save.boundingBox();
  if (saveBox && (await save.isEnabled())) {
    await moveMouse(page, saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2, 700);
    await clickHere(page);
    await page.waitForTimeout(1200);
  }

  await say(page, "JJ - Excel in Dataverse - the spreadsheet experience, inside your Model-Driven App.", 4400);
  await page.waitForTimeout(1000);
});
