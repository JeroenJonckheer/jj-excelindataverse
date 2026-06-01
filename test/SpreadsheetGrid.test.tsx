/*
 * Dataverse Spreadsheet
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
  ];
}

function rows(): GridRow[] {
  return [
    {
      recordId: "r1",
      raw: { name: "Acme", score: 10, status: 1 },
      display: { name: "Acme", score: "10", status: "Open" },
    },
    {
      recordId: "r2",
      raw: { name: "Globex", score: 20, status: 2 },
      display: { name: "Globex", score: "20", status: "Closed" },
    },
  ];
}

interface Harness {
  onSave: jest.Mock<Promise<void>, [string, PendingEdit[]]>;
  searchLookup: jest.Mock<Promise<LookupValue[]>, [string[], string]>;
  container: HTMLElement;
}

function renderGrid(overrides?: {
  onSave?: Harness["onSave"];
}): Harness {
  const onSave: Harness["onSave"] =
    overrides?.onSave ??
    jest.fn((_recordId: string, _edits: PendingEdit[]) => Promise.resolve());
  const searchLookup: Harness["searchLookup"] = jest.fn(
    (_targets: string[], _term: string) => Promise.resolve([] as LookupValue[]),
  );
  const { container } = render(
    <SpreadsheetGrid
      columns={columns()}
      rows={rows()}
      version="0.1.0"
      onSave={onSave}
      searchLookup={searchLookup}
    />,
  );
  return { onSave, searchLookup, container };
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
    expect(screen.getByText(/Dataverse Spreadsheet v0\.1\.0/)).toBeInTheDocument();
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
    fireEvent.click(cell(container, 0, 2));
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
});
