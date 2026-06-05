/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateEditor } from "../Spreadsheet/components/DateEditor";
import type { ColumnDef } from "../Spreadsheet/services/types";

const column: ColumnDef = {
  name: "duedate",
  displayName: "Close date",
  dataType: "DateAndTime.DateOnly",
  kind: "date",
  editable: true,
  required: "none",
};

function setup(initialText = "2026-06-05") {
  const onCommitText = jest.fn();
  const onCancel = jest.fn();
  render(
    <DateEditor
      column={column}
      initialText={initialText}
      onCommitText={onCommitText}
      onCancel={onCancel}
    />,
  );
  return { onCommitText, onCancel };
}

describe("DateEditor", () => {
  it("opens the calendar on the value's month", () => {
    setup();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("commits the day clicked in the grid as an ISO date", () => {
    const { onCommitText } = setup();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sat Jun 20 2026" }));
    expect(onCommitText).toHaveBeenCalledWith("2026-06-20", null);
  });

  it("navigates to the next month", () => {
    setup();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("jumps to a month from the year panel", () => {
    setup();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Aug" }));
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("commits typed text on Enter (keyboard entry still works)", () => {
    const { onCommitText } = setup("");
    const input = screen.getByLabelText("Close date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "07/04/2026" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitText).toHaveBeenCalledWith("07/04/2026", "Enter");
  });

  it("cancels on Escape", () => {
    const { onCancel } = setup();
    fireEvent.keyDown(screen.getByLabelText("Close date"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("navigates to the previous month and year", () => {
    setup();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Previous year" }));
    expect(screen.getByText("May 2025")).toBeInTheDocument();
  });

  it("commits the typed value and moves with ArrowDown", () => {
    const { onCommitText } = setup("2026-06-09");
    fireEvent.keyDown(screen.getByLabelText("Close date"), { key: "ArrowDown" });
    expect(onCommitText).toHaveBeenCalledWith("2026-06-09", "ArrowDown");
  });

  it("keeps the time of day for a date/time column", () => {
    const onCommitText = jest.fn();
    render(
      <DateEditor
        column={{ ...column, kind: "datetime", dataType: "DateAndTime.DateAndTime" }}
        initialText="2026-06-05 14:30"
        onCommitText={onCommitText}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: "Wed Jun 10 2026" }));
    expect(onCommitText).toHaveBeenCalledWith("2026-06-10 14:30", null);
  });
});
