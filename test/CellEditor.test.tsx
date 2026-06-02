/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CellEditor } from "../Spreadsheet/components/CellEditor";
import type { ColumnDef, LookupValue } from "../Spreadsheet/services/types";

function col(partial: Partial<ColumnDef>): ColumnDef {
  return {
    name: "c",
    displayName: "Field",
    dataType: "SingleLine.Text",
    kind: "text",
    editable: true,
    required: "none",
    ...partial,
  };
}

const noSearch = () => Promise.resolve([] as LookupValue[]);

describe("CellEditor dispatch", () => {
  it("renders a text input and commits text with a navigation key", () => {
    const onCommitText = jest.fn();
    render(
      <CellEditor
        column={col({ kind: "text" })}
        initialText="hi"
        onCommitText={onCommitText}
        onCommitValue={jest.fn()}
        onCancel={jest.fn()}
        searchLookup={noSearch}
      />,
    );
    const input = screen.getByLabelText("Field") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "there" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onCommitText).toHaveBeenCalledWith("there", "Tab");
  });

  it("commits text on blur", () => {
    const onCommitText = jest.fn();
    render(
      <CellEditor
        column={col({ kind: "text" })}
        initialText="hi"
        onCommitText={onCommitText}
        onCommitValue={jest.fn()}
        onCancel={jest.fn()}
        searchLookup={noSearch}
      />,
    );
    fireEvent.blur(screen.getByLabelText("Field"));
    expect(onCommitText).toHaveBeenCalledWith("hi", null);
  });

  it("renders a boolean dropdown and commits the chosen value", () => {
    const onCommitValue = jest.fn();
    render(
      <CellEditor
        column={col({
          kind: "boolean",
          options: [
            { value: 0, label: "No" },
            { value: 1, label: "Yes" },
          ],
        })}
        initialText="No"
        onCommitText={jest.fn()}
        onCommitValue={onCommitValue}
        onCancel={jest.fn()}
        searchLookup={noSearch}
      />,
    );
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "1" } });
    expect(onCommitValue).toHaveBeenCalledWith(true, null);
  });

  it("commits an empty choice value as null", () => {
    const onCommitValue = jest.fn();
    render(
      <CellEditor
        column={col({
          kind: "choice",
          options: [{ value: 1, label: "Open" }],
        })}
        initialText="Open"
        onCommitText={jest.fn()}
        onCommitValue={onCommitValue}
        onCancel={jest.fn()}
        searchLookup={noSearch}
      />,
    );
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "" } });
    expect(onCommitValue).toHaveBeenCalledWith(null, null);
  });

  it("cancels a choice edit on Escape", () => {
    const onCancel = jest.fn();
    render(
      <CellEditor
        column={col({ kind: "choice", options: [{ value: 1, label: "Open" }] })}
        initialText="Open"
        onCommitText={jest.fn()}
        onCommitValue={jest.fn()}
        onCancel={onCancel}
        searchLookup={noSearch}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Field"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("delegates lookup columns to the lookup editor", () => {
    render(
      <CellEditor
        column={col({ kind: "lookup", lookupTargets: ["contact"] })}
        initialText=""
        onCommitText={jest.fn()}
        onCommitValue={jest.fn()}
        onCancel={jest.fn()}
        searchLookup={noSearch}
      />,
    );
    expect(screen.getByLabelText("Field")).toBeInTheDocument();
  });
});
