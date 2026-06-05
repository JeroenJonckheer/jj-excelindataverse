/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LookupEditor } from "../Spreadsheet/components/LookupEditor";
import type { ColumnDef, LookupValue } from "../Spreadsheet/services/types";

const column: ColumnDef = {
  name: "primarycontactid",
  displayName: "Primary Contact",
  dataType: "Lookup.Simple",
  kind: "lookup",
  editable: true,
  required: "none",
  lookupTargets: ["contact"],
};

const suggestions: LookupValue[] = [
  { id: "1", name: "Jane Doe", entityType: "contact" },
  { id: "2", name: "John Roe", entityType: "contact" },
];

function setup() {
  const onCommitValue = jest.fn();
  const onCancel = jest.fn();
  const searchLookup = jest.fn(() => Promise.resolve(suggestions));
  render(
    <LookupEditor
      column={column}
      initialText=""
      searchLookup={searchLookup}
      onCommitValue={onCommitValue}
      onCancel={onCancel}
    />,
  );
  const input = screen.getByLabelText("Primary Contact") as HTMLInputElement;
  return { onCommitValue, onCancel, searchLookup, input };
}

describe("LookupEditor", () => {
  it("shows a browse list as soon as it opens (empty term)", async () => {
    const { searchLookup } = setup();
    await screen.findByText("Jane Doe");
    expect(searchLookup).toHaveBeenCalledWith(["contact"], "");
  });

  it("searches as the user types and lists suggestions", async () => {
    const { input, searchLookup } = setup();
    fireEvent.change(input, { target: { value: "J" } });
    await screen.findByText("Jane Doe");
    expect(searchLookup).toHaveBeenCalledWith(["contact"], "J");
    expect(screen.getByText("John Roe")).toBeInTheDocument();
  });

  it("commits the highlighted suggestion on Enter", async () => {
    const { input, onCommitValue } = setup();
    fireEvent.change(input, { target: { value: "J" } });
    await screen.findByText("Jane Doe");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitValue).toHaveBeenCalledWith(suggestions[1], "Enter");
  });

  it("commits a suggestion when clicked", async () => {
    const { input, onCommitValue } = setup();
    fireEvent.change(input, { target: { value: "J" } });
    const option = await screen.findByText("Jane Doe");
    fireEvent.mouseDown(option);
    expect(onCommitValue).toHaveBeenCalledWith(suggestions[0], null);
  });

  it("commits an empty value when the text is cleared", () => {
    const { input, onCommitValue } = setup();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitValue).toHaveBeenCalledWith(null, "Enter");
  });

  it("cancels on Escape", () => {
    const { input, onCancel } = setup();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
