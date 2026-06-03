/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SpreadsheetGrid } from "../Spreadsheet/components/SpreadsheetGrid";
import type { ColumnDef, LookupValue, PendingEdit } from "../Spreadsheet/services/types";
import type { GridRow } from "../Spreadsheet/services/dataset";

function columns(): ColumnDef[] {
  return [
    {
      name: "name",
      displayName: "Name",
      dataType: "SingleLine.Text",
      kind: "text",
      editable: true,
      required: "required",
      maxLength: 100,
    },
    {
      name: "score",
      displayName: "Score",
      dataType: "Decimal",
      kind: "number",
      editable: true,
      required: "none",
      minValue: 0,
      maxValue: 100,
    },
    {
      name: "status",
      displayName: "Status",
      dataType: "OptionSet",
      kind: "choice",
      editable: true,
      required: "none",
      defaultValue: 1,
      options: [
        { value: 1, label: "Open" },
        { value: 2, label: "Closed" },
      ],
    },
    {
      name: "owner",
      displayName: "Owner",
      dataType: "Lookup.Simple",
      kind: "lookup",
      editable: true,
      required: "none",
      lookupTargets: ["contact"],
    },
  ];
}

function rows(): GridRow[] {
  return [
    {
      recordId: "r1",
      raw: {
        name: "Acme",
        score: 10,
        status: 1,
        owner: { id: "c9", name: "Owner Co", entityType: "contact" },
      },
      display: { name: "Acme", score: "10", status: "Open", owner: "Owner Co" },
    },
    {
      recordId: "r2",
      raw: { name: "Globex", score: 20, status: 2, owner: null },
      display: { name: "Globex", score: "20", status: "Closed", owner: "" },
    },
  ];
}

interface Harness {
  onSave: jest.Mock<Promise<void>, [string, PendingEdit[]]>;
  onCreate: jest.Mock<Promise<void>, [PendingEdit[]]>;
  onDelete: jest.Mock<Promise<void>, [string]>;
  onOpenRecord: jest.Mock<void, [string]>;
  onOpenLookup: jest.Mock<void, [string, string]>;
  searchLookup: jest.Mock<Promise<LookupValue[]>, [string[], string]>;
  resolveLookup: jest.Mock<Promise<LookupValue[]>, [string[], string]>;
  container: HTMLElement;
}

const JANE: LookupValue = { id: "1", name: "Jane Doe", entityType: "contact" };

function renderGrid(overrides?: {
  onSave?: Harness["onSave"];
  onCreate?: Harness["onCreate"];
  onDelete?: Harness["onDelete"];
  onOpenRecord?: Harness["onOpenRecord"];
  resolveLookup?: Harness["resolveLookup"];
  onSort?: (columnName: string) => void;
  sortColumn?: string | null;
  sortDescending?: boolean;
}): Harness {
  const onSave: Harness["onSave"] =
    overrides?.onSave ??
    jest.fn((_recordId: string, _edits: PendingEdit[]) => Promise.resolve());
  const onCreate: Harness["onCreate"] =
    overrides?.onCreate ?? jest.fn((_edits: PendingEdit[]) => Promise.resolve());
  const onDelete: Harness["onDelete"] =
    overrides?.onDelete ?? jest.fn((_recordId: string) => Promise.resolve());
  const onOpenRecord: Harness["onOpenRecord"] =
    overrides?.onOpenRecord ?? jest.fn((_recordId: string) => undefined);
  const onOpenLookup: Harness["onOpenLookup"] = jest.fn(
    (_entityType: string, _recordId: string) => undefined,
  );
  const searchLookup: Harness["searchLookup"] = jest.fn(
    (_targets: string[], _term: string) => Promise.resolve([] as LookupValue[]),
  );
  const resolveLookup: Harness["resolveLookup"] =
    overrides?.resolveLookup ??
    jest.fn((_targets: string[], text: string) =>
      Promise.resolve(text.trim().toLowerCase() === "jane doe" ? [JANE] : []),
    );
  const { container } = render(
    <SpreadsheetGrid
      columns={columns()}
      rows={rows()}
      version="0.1.0"
      onSave={onSave}
      onCreate={onCreate}
      onDelete={onDelete}
      onOpenRecord={onOpenRecord}
      onOpenLookup={onOpenLookup}
      searchLookup={searchLookup}
      resolveLookup={resolveLookup}
      onSort={overrides?.onSort}
      sortColumn={overrides?.sortColumn ?? null}
      sortDescending={overrides?.sortDescending}
    />,
  );
  return {
    onSave,
    onCreate,
    onDelete,
    onOpenRecord,
    onOpenLookup,
    searchLookup,
    resolveLookup,
    container,
  };
}

function cell(container: HTMLElement, row: number, col: number): HTMLElement {
  const el = container.querySelector(
    `[data-row="${row}"][data-col="${col}"]`,
  );
  if (!el) throw new Error(`cell ${row},${col} not found`);
  return el as HTMLElement;
}

describe("rendering", () => {
  it("shows the headers, cell values and version", () => {
    renderGrid();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText(/JJ - Excel in Dataverse v0\.1\.0/)).toBeInTheDocument();
  });

  it("marks a required column header", () => {
    const { container } = renderGrid();
    const header = within(container).getByText("Name").closest("th");
    expect(header?.textContent).toContain("*");
  });
});

describe("selection and navigation", () => {
  it("activates a cell on click", () => {
    const { container } = renderGrid();
    const c = cell(container, 0, 0);
    fireEvent.click(c);
    expect(c.className).toContain("jj-sheet-td-active");
  });

  it("moves the active cell with the arrow keys", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(cell(container, 0, 1).className).toContain("jj-sheet-td-active");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(cell(container, 1, 1).className).toContain("jj-sheet-td-active");
  });

  it("moves with Tab and wraps to the next row", () => {
    const { container } = renderGrid();
    // Tab from the last column wraps to the first column of the next row.
    fireEvent.click(cell(container, 0, 3));
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "Tab" });
    expect(cell(container, 1, 0).className).toContain("jj-sheet-td-active");
  });
});

describe("inline editing", () => {
  it("edits a text cell by typing and commits on Enter", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "A" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme Corporation" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
    expect(screen.getByText(/1 pending change/)).toBeInTheDocument();
  });

  it("opens the choice dropdown on a single click and commits the chosen value", () => {
    const { container } = renderGrid();
    // Single click enters edit and shows the native select.
    fireEvent.click(cell(container, 0, 2));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "2" } });
    expect(cell(container, 0, 2).textContent).toContain("Closed");
    expect(screen.getByText(/1 pending change/)).toBeInTheDocument();
  });

  it("cancels an edit on Escape and keeps the original value", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Z" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});

describe("validation", () => {
  it("flags an out-of-range number, blocks save and shows the message", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 1));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "9" });
    const input = screen.getByLabelText("Score") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cell(container, 0, 1).className).toContain("jj-sheet-td-invalid");
    expect(screen.getByText("Value must be at most 100.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  });

  it("flags clearing a required cell", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" });
    expect(cell(container, 0, 0).className).toContain("jj-sheet-td-invalid");
    expect(screen.getByText("This field is required.")).toBeInTheDocument();
  });

  it("drops the pending change when a cell is returned to its original value", () => {
    const { container } = renderGrid();
    // r1 Name starts as "Acme"; change it, then change it back.
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "O" });
    let input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Other" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/1 pending change/)).toBeInTheDocument();
    expect(cell(container, 0, 0).className).toContain("jj-sheet-td-dirty");

    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "A" });
    input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/No pending changes/)).toBeInTheDocument();
    expect(cell(container, 0, 0).className).not.toContain("jj-sheet-td-dirty");
  });

  // ---- Brok C: validation ----

  it("blocks saving a new row that has an empty required field", () => {
    const onCreate: Harness["onCreate"] = jest.fn((_edits: PendingEdit[]) =>
      Promise.resolve(),
    );
    const { container } = renderGrid({ onCreate });
    // Add a new row, then fill only the (non-required) Score, leaving Name empty.
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    fireEvent.click(cell(container, 2, 1));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "5" });
    const input = screen.getByLabelText("Score") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(cell(container, 2, 0).className).toContain("jj-sheet-td-invalid");
    expect(screen.getByText("This field is required.")).toBeInTheDocument();
  });

  it("shows the server error inline and keeps the change on a failed save", async () => {
    const onSave: Harness["onSave"] = jest.fn(
      (_recordId: string, _edits: PendingEdit[]) =>
        Promise.reject({ message: "Business rule blocked this" }),
    );
    const { container } = renderGrid({ onSave });
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "X" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Business rule blocked this");
    const row = cell(container, 0, 0).closest("tr") as HTMLElement;
    expect(row.className).toContain("jj-sheet-row-error");
  });
});

describe("saving", () => {
  it("saves pending edits and clears them on success", async () => {
    const onSave: Harness["onSave"] = jest.fn(
      (_recordId: string, _edits: PendingEdit[]) => Promise.resolve(),
    );
    const { container } = renderGrid({ onSave });
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "X" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [recordId, edits] = onSave.mock.calls[0];
    expect(recordId).toBe("r1");
    expect(edits[0].columnName).toBe("name");
    expect(edits[0].value).toBe("New Name");
    await waitFor(() =>
      expect(screen.getByText(/No pending changes/)).toBeInTheDocument(),
    );
  });

  it("keeps edits and shows the server error when a save fails", async () => {
    const onSave: Harness["onSave"] = jest.fn(
      (_recordId: string, _edits: PendingEdit[]): Promise<void> =>
        Promise.reject(new Error("Business rule blocked this.")),
    );
    const { container } = renderGrid({ onSave });
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Y" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Another" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() =>
      expect(screen.getByText("Business rule blocked this.")).toBeInTheDocument(),
    );
    expect(cell(container, 0, 0).closest("tr")?.className).toContain("jj-sheet-row-error");
  });
});

describe("paste", () => {
  it("fills several cells from a tab separated block", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "Hooli\t55\nInitech\t60" },
    });
    expect(screen.getByText("Hooli")).toBeInTheDocument();
    expect(screen.getByText("Initech")).toBeInTheDocument();
    expect(screen.getByText(/4 pending changes/)).toBeInTheDocument();
  });

  it("creates a new row when a paste runs one past the end", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "One\nTwo\nThree" },
    });
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
    expect(screen.getByText(/1 new row/)).toBeInTheDocument();
  });

  it("uses the clipboard HTML table even when the plain text is mangled", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    const html =
      "<table><tr><td>Row1</td><td>10</td></tr><tr><td>Row2</td><td>20</td></tr></table>";
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: {
        getData: (type: string) =>
          type === "text/html" ? html : "Row1\t10\tRow2\t20",
      },
    });
    expect(cell(container, 0, 0)).toHaveTextContent("Row1");
    expect(cell(container, 1, 0)).toHaveTextContent("Row2");
  });

  it("recovers rows from tab-only plain text using the column count", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    // No HTML; one line of 8 tab-separated cells for the 4-column grid.
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: {
        getData: (type: string) =>
          type === "text/html" ? "" : "P1\t5\tOpen\t\tP2\t6\tClosed\t",
      },
    });
    expect(cell(container, 0, 0)).toHaveTextContent("P1");
    expect(cell(container, 1, 0)).toHaveTextContent("P2");
  });
});

describe("undo and redo", () => {
  it("undoes a typed edit with Ctrl+Z", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "C" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Changed Co" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Changed Co")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("grid"), { key: "z", ctrlKey: true });
    expect(screen.queryByText("Changed Co")).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText(/No pending changes/)).toBeInTheDocument();
  });

  it("undoes a wrong paste in one step", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "Wrong1\nWrong2" },
    });
    expect(screen.getByText("Wrong1")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("grid"), { key: "z", ctrlKey: true });
    expect(screen.queryByText("Wrong1")).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("undo removes rows created by a paste, not just the pasted values", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "A1\nB2\nC3\nD4" },
    });
    // Two existing rows filled, two new rows created (indexes 2 and 3).
    expect(container.querySelector('[data-row="3"]')).not.toBeNull();

    fireEvent.keyDown(screen.getByRole("grid"), { key: "z", ctrlKey: true });
    // The created rows are gone again - no leftover empty rows.
    expect(container.querySelector('[data-row="2"]')).toBeNull();
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
  });

  it("redoes an undone edit with Ctrl+Y", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "C" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Redone Co" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.keyDown(screen.getByRole("grid"), { key: "z", ctrlKey: true });
    expect(screen.queryByText("Redone Co")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "y", ctrlKey: true });
    expect(screen.getByText("Redone Co")).toBeInTheDocument();
  });
});

describe("new rows", () => {
  it("adds a new row with ArrowDown and creates it on save", async () => {
    const onCreate = jest.fn((_edits: PendingEdit[]) => Promise.resolve());
    const { container } = renderGrid({ onCreate });
    // Press ArrowDown on the last row to grow the grid.
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });

    // The new row is appended at index 2.
    expect(cell(container, 2, 0)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "N" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Brand New Co" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Brand New Co")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const edits = onCreate.mock.calls[0][0];
    expect(edits[0].columnName).toBe("name");
    expect(edits[0].value).toBe("Brand New Co");
  });

  it("creates rows when a paste runs past the end of the grid", async () => {
    const onSave = jest.fn((_r: string, _e: PendingEdit[]) => Promise.resolve());
    const onCreate = jest.fn((_edits: PendingEdit[]) => Promise.resolve());
    const { container } = renderGrid({ onSave, onCreate });
    fireEvent.click(cell(container, 0, 0));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "A1\nB2\nC3\nD4" },
    });
    expect(screen.getByText("C3")).toBeInTheDocument();
    expect(screen.getByText("D4")).toBeInTheDocument();
    expect(screen.getByText(/2 new rows/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

describe("paste into new rows", () => {
  it("pastes several rows starting from a freshly added empty row", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "P1\nP2\nP3" },
    });
    expect(cell(container, 2, 0)).toHaveTextContent("P1");
    expect(cell(container, 3, 0)).toHaveTextContent("P2");
    expect(cell(container, 4, 0)).toHaveTextContent("P3");
  });
});

describe("pasted lookups", () => {
  it("resolves a pasted name to a record", async () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 3));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "Jane Doe" },
    });
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(cell(container, 0, 3).className).not.toContain("jj-sheet-td-invalid");
  });

  it("flags a pasted lookup with no matching record", async () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 3));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "Ghost Inc" },
    });
    expect(await screen.findByText(/No matching record/)).toBeInTheDocument();
    expect(cell(container, 0, 3).className).toContain("jj-sheet-td-invalid");
  });

  it("flags an ambiguous pasted lookup with multiple matches", async () => {
    const resolveLookup = jest.fn((_t: string[], _text: string) =>
      Promise.resolve([
        { id: "1", name: "Jane Doe", entityType: "contact" },
        { id: "2", name: "Jane Doe", entityType: "contact" },
      ]),
    );
    const { container } = renderGrid({ resolveLookup });
    fireEvent.click(cell(container, 0, 3));
    fireEvent.paste(screen.getByRole("grid"), {
      clipboardData: { getData: () => "Jane Doe" },
    });
    expect(await screen.findByText(/Multiple records match/)).toBeInTheDocument();
    expect(cell(container, 0, 3).className).toContain("jj-sheet-td-invalid");
  });
});

describe("selection, deletion and opening", () => {
  const rowCheckbox = (container: HTMLElement, recordId: string) =>
    container.querySelector(
      `tr[data-record-id="${recordId}"] input[type="checkbox"]`,
    ) as HTMLInputElement;

  it("marks a selected existing row for deletion and deletes it on save", async () => {
    const onDelete = jest.fn((_id: string) => Promise.resolve());
    const { container } = renderGrid({ onDelete });
    fireEvent.click(rowCheckbox(container, "r1"));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected \(1\)/ }));
    expect(
      container.querySelector('tr[data-record-id="r1"]')?.className,
    ).toContain("jj-sheet-row-delete");
    expect(screen.getByText(/1 pending deletion/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("r1"));
  });

  it("removes a new row immediately without a server delete", () => {
    const onDelete = jest.fn((_id: string) => Promise.resolve());
    const { container } = renderGrid({ onDelete });
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    expect(container.querySelector('[data-row="2"]')).not.toBeNull();

    const newRow = container.querySelectorAll("tbody tr")[2];
    fireEvent.click(newRow.querySelector('input[type="checkbox"]') as HTMLInputElement);
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(container.querySelector('[data-row="2"]')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("undo restores a row marked for deletion", () => {
    const { container } = renderGrid();
    fireEvent.click(rowCheckbox(container, "r1"));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(
      container.querySelector('tr[data-record-id="r1"]')?.className,
    ).toContain("jj-sheet-row-delete");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "z", ctrlKey: true });
    expect(
      container.querySelector('tr[data-record-id="r1"]')?.className,
    ).not.toContain("jj-sheet-row-delete");
  });

  it("reports selected saved-record ids to the host for command-bar sync", () => {
    const onSelectionChange = jest.fn();
    const { container } = render(
      <SpreadsheetGrid
        columns={columns()}
        rows={rows()}
        version="0.1.0"
        onSave={jest.fn(() => Promise.resolve())}
        onCreate={jest.fn(() => Promise.resolve())}
        onDelete={jest.fn(() => Promise.resolve())}
        onOpenRecord={jest.fn()}
        searchLookup={jest.fn(() => Promise.resolve([] as LookupValue[]))}
        resolveLookup={jest.fn(() => Promise.resolve([] as LookupValue[]))}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(rowCheckbox(container, "r2"));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["r2"]);
  });

  it("renders a lookup value as a link that opens the referenced record", () => {
    const { container, onOpenLookup } = renderGrid();
    const link = container.querySelector(
      'tr[data-record-id="r1"] .jj-sheet-link',
    ) as HTMLElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toBe("Owner Co");
    fireEvent.click(link);
    expect(onOpenLookup).toHaveBeenCalledWith("contact", "c9");
  });

  it("opens the record on double-click of a saved row", () => {
    const onOpenRecord = jest.fn();
    const { container } = renderGrid({ onOpenRecord });
    fireEvent.doubleClick(cell(container, 0, 0));
    expect(onOpenRecord).toHaveBeenCalledWith("r1");
  });

  it("does not open an unsaved new row", () => {
    const onOpenRecord = jest.fn();
    const { container } = renderGrid({ onOpenRecord });
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    fireEvent.doubleClick(cell(container, 2, 0));
    expect(onOpenRecord).not.toHaveBeenCalled();
  });

  it("deletes a row that also has pending edits, skipping its update", async () => {
    const onSave = jest.fn((_r: string, _e: PendingEdit[]) => Promise.resolve());
    const onDelete = jest.fn((_id: string) => Promise.resolve());
    const { container } = renderGrid({ onSave, onDelete });
    // Edit r1, then mark it for deletion.
    fireEvent.click(cell(container, 0, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "X" });
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Temp" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(rowCheckbox(container, "r1"));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));

    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("r1"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("deletes a row from the right-click context menu", () => {
    const { container } = renderGrid();
    fireEvent.contextMenu(container.querySelector('tr[data-record-id="r2"]') as HTMLElement);
    fireEvent.click(screen.getByText("Delete row"));
    expect(
      container.querySelector('tr[data-record-id="r2"]')?.className,
    ).toContain("jj-sheet-row-delete");
  });
});

describe("sorting and resizing", () => {
  it("requests a sort when a column header is clicked", () => {
    const onSort = jest.fn();
    const { container } = renderGrid({ onSort });
    const header = within(container).getByText("Score").closest("th") as HTMLElement;
    fireEvent.click(header);
    expect(onSort).toHaveBeenCalledWith("score");
  });

  it("shows the sort indicator on the sorted column", () => {
    const { container } = renderGrid({
      onSort: jest.fn(),
      sortColumn: "name",
      sortDescending: true,
    });
    const header = within(container).getByText("Name").closest("th") as HTMLElement;
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(header.querySelector(".jj-sheet-sort-desc")).not.toBeNull();
  });

  it("resizes a column by dragging its handle", () => {
    const { container } = renderGrid();
    const handle = container.querySelectorAll(".jj-sheet-resize-handle")[0] as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document);
    // The first data column's <col> is index 1 (index 0 is the selection column).
    const col = container.querySelectorAll("colgroup col")[1] as HTMLElement;
    expect(col.style.width).toBe("120px");
  });

  it("reorders columns by dragging a header", () => {
    const { container } = renderGrid();
    const dataHeaders = () =>
      Array.from(container.querySelectorAll("thead th"))
        .slice(1)
        .map((th) => th.querySelector("span")?.textContent);
    expect(dataHeaders()).toEqual(["Name", "Score", "Status", "Owner"]);

    const ths = container.querySelectorAll("thead th");
    const dt = { setData: jest.fn(), getData: jest.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(ths[4], { dataTransfer: dt }); // Owner
    fireEvent.dragOver(ths[1], { dataTransfer: dt }); // over Name
    fireEvent.drop(ths[1], { dataTransfer: dt });
    expect(dataHeaders()).toEqual(["Owner", "Name", "Score", "Status"]);
  });

  it("auto-fits a column on double-clicking its border", () => {
    const { container } = renderGrid();
    const handle = container.querySelectorAll(".jj-sheet-resize-handle")[0] as HTMLElement;
    fireEvent.doubleClick(handle);
    // jsdom reports a content width of 0, so the fit clamps to the minimum - this
    // proves the auto-fit override was applied to the first data column.
    const col = container.querySelectorAll("colgroup col")[1] as HTMLElement;
    expect(col.style.width).toBe("48px");
  });

  it("freezes columns up to the pinned one and unfreezes again", () => {
    const { container } = renderGrid();
    // Default: nothing frozen.
    expect(cell(container, 0, 0).className).not.toContain("jj-sheet-col-frozen");

    // Pin the third column (index 2): columns 0, 1 and 2 freeze.
    fireEvent.click(container.querySelectorAll(".jj-sheet-pin")[2]);
    expect(cell(container, 0, 0).className).toContain("jj-sheet-col-frozen");
    expect(cell(container, 0, 1).className).toContain("jj-sheet-col-frozen");
    expect(cell(container, 0, 2).className).toContain("jj-sheet-col-frozen");
    expect(cell(container, 0, 3).className).not.toContain("jj-sheet-col-frozen");
    expect(cell(container, 0, 2).className).toContain("jj-sheet-col-frozen-edge");

    // Clicking the same pin again unfreezes everything.
    fireEvent.click(container.querySelectorAll(".jj-sheet-pin")[2]);
    expect(cell(container, 0, 0).className).not.toContain("jj-sheet-col-frozen");
  });
});

describe("range selection", () => {
  it("selects a range with shift+click and tints the cells", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 1));
    fireEvent.click(cell(container, 1, 1), { shiftKey: true });
    expect(cell(container, 0, 1).className).toContain("jj-sheet-td-selected");
    expect(cell(container, 1, 1).className).toContain("jj-sheet-td-selected");
  });

  it("shows the Excel-style aggregate for a numeric selection", () => {
    const { container } = renderGrid();
    // Score column (col 1): r1 = 10, r2 = 20.
    fireEvent.click(cell(container, 0, 1));
    fireEvent.click(cell(container, 1, 1), { shiftKey: true });
    const agg = container.querySelector(".jj-sheet-agg") as HTMLElement;
    expect(agg).not.toBeNull();
    expect(agg.textContent).toContain("Count 2");
    expect(agg.textContent).toContain("Sum 30");
    expect(agg.textContent).toContain("Average 15");
  });

  it("clears every editable cell in the selection on Delete", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 1));
    fireEvent.click(cell(container, 1, 1), { shiftKey: true });
    const grid = container.querySelector(".jj-sheet") as HTMLElement;
    fireEvent.keyDown(grid, { key: "Delete" });
    expect(cell(container, 0, 1).textContent).toBe("");
    expect(cell(container, 1, 1).textContent).toBe("");
    // Both cleared cells are pending changes.
    expect(screen.getByText(/2 pending changes/)).toBeInTheDocument();
  });

  it("extends the selection with Shift+ArrowDown", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 1));
    const grid = container.querySelector(".jj-sheet") as HTMLElement;
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    expect(cell(container, 0, 1).className).toContain("jj-sheet-td-selected");
    expect(cell(container, 1, 1).className).toContain("jj-sheet-td-selected");
  });

  it("selects a range by dragging with the mouse", () => {
    const { container } = renderGrid();
    fireEvent.mouseDown(cell(container, 0, 0));
    fireEvent.mouseEnter(cell(container, 1, 0), { buttons: 1 });
    expect(cell(container, 0, 0).className).toContain("jj-sheet-td-selected");
    expect(cell(container, 1, 0).className).toContain("jj-sheet-td-selected");
  });

  it("self-heals a drag whose mouse-up was missed (no stuck selection)", () => {
    const { container } = renderGrid();
    fireEvent.mouseDown(cell(container, 0, 0));
    fireEvent.mouseEnter(cell(container, 1, 0), { buttons: 1 });
    // Mouse-up was missed (released outside the iframe). A later hover with no
    // button held must not keep extending the selection.
    fireEvent.mouseEnter(cell(container, 1, 1), { buttons: 0 });
    expect(cell(container, 1, 1).className).not.toContain("jj-sheet-td-selected");
  });
});

describe("defaults and duplicate (brok D)", () => {
  it("shows the metadata default on a new row without marking it dirty", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    // Status (col 2) shows its default option label on the new row.
    expect(cell(container, 2, 2).textContent).toContain("Open");
    // Defaults are display-only, so there is no pending change yet.
    expect(screen.getByText(/No pending changes/)).toBeInTheDocument();
  });

  it("duplicates a row into a new pre-filled row via the context menu", () => {
    const { container } = renderGrid();
    fireEvent.contextMenu(cell(container, 0, 0));
    fireEvent.click(screen.getByText("Duplicate row"));
    expect(cell(container, 2, 0).textContent).toContain("Acme");
    expect(screen.getByText(/pending change/)).toBeInTheDocument();
  });
});

describe("find and replace (brok F)", () => {
  it("opens find with Ctrl+F and highlights matches", () => {
    const { container } = renderGrid();
    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    const input = screen.getByLabelText("Find") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme" } });
    expect(cell(container, 0, 0).className).toContain("jj-sheet-td-match");
    expect(screen.getByLabelText("Match count").textContent).toContain("1/1");
  });

  it("replaces the current match as a pending edit (Ctrl+H)", () => {
    const { container } = renderGrid();
    fireEvent.keyDown(document, { key: "h", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Find"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Replace with"), { target: { value: "Zeta" } });
    fireEvent.click(screen.getByRole("button", { name: /^Replace$/ }));
    expect(cell(container, 0, 0).textContent).toContain("Zeta");
    expect(screen.getByText(/1 pending change/)).toBeInTheDocument();
  });
});

describe("fill handle", () => {
  it("shows a fill handle on the active cell", () => {
    const { container } = renderGrid();
    fireEvent.click(cell(container, 0, 1));
    expect(
      cell(container, 0, 1).querySelector(".jj-sheet-fill-handle"),
    ).not.toBeNull();
  });

  it("fills a value down when dragging the handle", () => {
    const { container } = renderGrid();
    // Select the Score cell of r1 (= 10).
    fireEvent.click(cell(container, 0, 1));
    const handle = cell(container, 0, 1).querySelector(
      ".jj-sheet-fill-handle",
    ) as HTMLElement;
    fireEvent.mouseDown(handle);
    fireEvent.mouseEnter(cell(container, 1, 1), { buttons: 1 });
    fireEvent.mouseUp(document);
    // r2's Score now copies r1's value.
    expect(cell(container, 1, 1).textContent).toBe("10");
    expect(screen.getByText(/pending change/)).toBeInTheDocument();
    // The whole resulting series is framed (selected), like Excel.
    expect(cell(container, 0, 1).className).toContain("jj-sheet-td-selected");
    expect(cell(container, 1, 1).className).toContain("jj-sheet-td-selected");
  });
});
