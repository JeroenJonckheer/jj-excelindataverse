/*
 * JJ - Excel in Dataverse - narrated demo choreography.
 * A slow, readable walkthrough with a visible mouse cursor and English captions
 * that name each feature, so a viewer can follow exactly what the control does.
 */
import { test, type Page } from "@playwright/test";

function cell(page: Page, row: number, col: number) {
  return page.locator(`[data-row="${row}"][data-col="${col}"]`);
}

// Tracked pointer position so we can glide visibly between points.
let pos = { x: 800, y: 460 };

// Injects a visible cursor, a caption bar, and small click pulses. Playwright's
// recorded video has no real cursor; this draws one that follows mousemove.
async function installOverlay(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      #demo-cursor{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;
        margin:-2px 0 0 -2px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));}
      #demo-ring{position:fixed;z-index:2147483646;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;
        border:3px solid #0f6cbd;border-radius:50%;pointer-events:none;opacity:0;}
      #demo-ring.go{animation:demoRing .5s ease-out;}
      @keyframes demoRing{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(2.6)}}
      #demo-caption{position:fixed;z-index:2147483645;left:50%;top:14px;transform:translateX(-50%);
        max-width:1180px;padding:13px 24px;border-radius:10px;background:rgba(17,24,39,.93);color:#fff;
        font:600 27px/1.35 "Segoe UI",Arial,sans-serif;text-align:center;pointer-events:none;
        opacity:0;transition:opacity .4s;box-shadow:0 6px 26px rgba(0,0,0,.4);}
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
    const w = window as unknown as {
      __say: (t: string) => void;
      __pulse: () => void;
    };
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

// Glide the pointer from its current spot to (x,y) over ~ms, updating the
// visible cursor through real mousemove events.
async function moveMouse(page: Page, x: number, y: number, ms = 750) {
  const steps = Math.max(10, Math.round(ms / 28));
  const from = { ...pos };
  for (let i = 1; i <= steps; i++) {
    const px = from.x + ((x - from.x) * i) / steps;
    const py = from.y + ((y - from.y) * i) / steps;
    await page.mouse.move(px, py);
    await page.waitForTimeout(ms / steps);
  }
  pos = { x, y };
}

async function center(page: Page, row: number, col: number) {
  const b = await cell(page, row, col).boundingBox();
  if (!b) throw new Error(`cell ${row},${col} not found`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

async function moveToCell(page: Page, row: number, col: number, ms = 750) {
  const c = await center(page, row, col);
  await moveMouse(page, c.x, c.y, ms);
  return c;
}

async function clickHere(page: Page) {
  await page.evaluate(() => (window as unknown as { __pulse: () => void }).__pulse());
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function typeText(page: Page, value: string) {
  await page.keyboard.type(value, { delay: 55 });
}

test("demo", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.waitForSelector(".jj-sheet-row");
  await installOverlay(page);
  await page.mouse.move(pos.x, pos.y); // place the cursor
  await page.waitForTimeout(900);

  await say(
    page,
    "JJ - Excel in Dataverse: edit your Dataverse records inline, like a spreadsheet.",
    3800,
  );

  // 1. Inline edit
  await say(page, "Click any cell and just type - no form, no export to Excel.", 3000);
  await moveToCell(page, 0, 0);
  await clickHere(page);
  await page.keyboard.press("Enter");
  await typeText(page, "Acme Corporation NV");
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await say(page, "The cell is now a pending change, ready to save.", 2800);

  // 2. Choice dropdown
  await say(page, "Choice fields open a dropdown on a single click.", 3000);
  await moveToCell(page, 1, 3);
  await clickHere(page);
  await page.waitForTimeout(400);
  try {
    await page.getByLabel("Status").selectOption({ label: "Won" });
  } catch {
    /* option set may differ */
  }
  await page.waitForTimeout(900);

  // 3. Range selection + aggregates
  await say(page, "Select a range - the footer shows count, sum and average, like Excel.", 3400);
  await moveToCell(page, 2, 2);
  await clickHere(page);
  await moveToCell(page, 6, 2, 850);
  await page.keyboard.down("Shift");
  await clickHere(page);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(2200);

  // 4. Copy
  await say(page, "Copy with Ctrl+C - paste it straight into Excel.", 3000);
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");

  // 5. Fill handle
  await say(page, "Drag the fill handle to extend a number down as a series.", 3400);
  const fillStart = await moveToCell(page, 0, 2);
  await clickHere(page);
  await page.waitForTimeout(300);
  try {
    const handle = await page.locator(".jj-sheet-fill-handle").boundingBox();
    if (handle) {
      await moveMouse(page, handle.x + handle.width / 2, handle.y + handle.height / 2, 450);
      await page.mouse.down();
      const target = await center(page, 4, 2);
      await moveMouse(page, target.x, target.y, 1100);
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    void fillStart;
  } catch {
    /* fill geometry can vary headless */
  }

  // 6. Paste from Excel - the headline
  await say(
    page,
    "Paste straight from Excel: rows and columns at once. Rows past the end are created for you.",
    4200,
  );
  await moveToCell(page, 12, 0);
  await clickHere(page);
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () =>
          "Northwind Traders\tinfo@northwind.example\nFabrikam\tsales@fabrikam.example\nContoso Ltd\thello@contoso.example",
      },
    });
    grid.dispatchEvent(event);
  });
  await page.waitForTimeout(2400);

  // 7. Move a block by dragging its border
  await say(page, "Move a block of cells by dragging its border.", 3400);
  await moveToCell(page, 8, 1);
  await clickHere(page);
  await moveToCell(page, 10, 2, 800);
  await page.keyboard.down("Shift");
  await clickHere(page);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(700);
  try {
    const band = await page.locator(".jj-sheet-move-left").boundingBox();
    if (band) {
      await moveMouse(page, band.x + band.width / 2, band.y + 8, 450);
      await page.mouse.down();
      const target = await center(page, 5, 1);
      await moveMouse(page, target.x, target.y, 1200);
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(800);
    }
  } catch {
    /* move band geometry can vary headless */
  }

  // 8. Find
  await say(page, "Find anything across the grid with Ctrl+F.", 3200);
  await page.keyboard.press("Control+f");
  await page.waitForTimeout(400);
  await page.getByLabel("Find").fill("Cyberdyne");
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 9. Sort
  await say(page, "Sort by clicking a column header.", 3000);
  const scoreHeader = await page.getByRole("columnheader", { name: "Score" }).boundingBox();
  if (scoreHeader) {
    await moveMouse(page, scoreHeader.x + scoreHeader.width / 2, scoreHeader.y + scoreHeader.height / 2, 700);
    await clickHere(page);
  }
  await page.waitForTimeout(1500);

  // 10. Save
  await say(page, "Save - every change is written back to Dataverse in one batch.", 3600);
  const save = page.getByRole("button", { name: "Save changes" });
  const saveBox = await save.boundingBox();
  if (saveBox && (await save.isEnabled())) {
    await moveMouse(page, saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2, 700);
    await clickHere(page);
    await page.waitForTimeout(1200);
  }

  // Closing hold
  await say(
    page,
    "JJ - Excel in Dataverse - the spreadsheet experience, inside your Model-Driven App.",
    4200,
  );
  await page.waitForTimeout(1200);
});
