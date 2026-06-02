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
      raw: { name: "Acme", score: 10, status: 1, owner: null },
      display: { name: "Acme", score: "10", status: "Open", owner: "" },
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
  searchLookup: jest.Mock<Promise<LookupValue[]>, [string[], string]>;
  resolveLookup: jest.Mock<Promise<LookupValue[]>, [string[], string]>;
  container: HTMLElement;
}

const JANE: LookupValue = { id: "1", name: "Jane Doe", entityType: "contact" };

function renderGrid(overrides?: {
  onSave?: Harness["onSave"];
  onCreate?: Harness["onCreate"];
  resolveLookup?: Harness["resolveLookup"];
}): Harness {
  const onSave: Harness["onSave"] =
    overrides?.onSave ??
    jest.fn((_recordId: string, _edits: PendingEdit[]) => Promise.resolve());
  const onCreate: Harness["onCreate"] =
    overrides?.onCreate ?? jest.fn((_edits: PendingEdit[]) => Promise.resolve());
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
      searchLookup={searchLookup}
      resolveLookup={resolveLookup}
    />,
  );
  return { onSave, onCreate, searchLookup, resolveLookup, container };
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

  it("edits a choice cell with the dropdown", () => {
    const { container } = renderGrid();
    fireEvent.doubleClick(cell(container, 0, 2));
    const select = screen.getByLabelText("Status") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.keyDown(select, { key: "Enter" });
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
