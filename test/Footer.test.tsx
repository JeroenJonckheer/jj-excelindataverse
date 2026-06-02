/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Footer } from "../Spreadsheet/components/Footer";

function renderFooter(overrides: Partial<React.ComponentProps<typeof Footer>> = {}) {
  const props: React.ComponentProps<typeof Footer> = {
    version: "0.1.0",
    dirtyCount: 0,
    errorCount: 0,
    deleteCount: 0,
    selectedCount: 0,
    saving: false,
    message: null,
    onSave: jest.fn(),
    onDeleteSelected: jest.fn(),
    ...overrides,
  };
  render(<Footer {...props} />);
  return props;
}

describe("Footer", () => {
  it("shows the version", () => {
    renderFooter();
    expect(screen.getByText(/JJ - Excel in Dataverse v0\.1\.0/)).toBeInTheDocument();
  });

  it("disables save with no changes", () => {
    renderFooter();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getByText(/No pending changes/)).toBeInTheDocument();
  });

  it("disables save while there are validation errors", () => {
    renderFooter({ dirtyCount: 2, errorCount: 1, message: "Bad value" });
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getByText("Bad value")).toBeInTheDocument();
  });

  it("enables save and calls onSave when clean and dirty", () => {
    const props = renderFooter({ dirtyCount: 3 });
    const button = screen.getByRole("button", { name: /Save changes/ });
    expect(button).toBeEnabled();
    expect(screen.getByText(/3 pending changes/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(props.onSave).toHaveBeenCalled();
  });

  it("enables save when only deletions are pending", () => {
    renderFooter({ deleteCount: 2 });
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeEnabled();
    expect(screen.getByText(/2 pending deletions/)).toBeInTheDocument();
  });

  it("shows the delete-selected button only when rows are selected", () => {
    const props = renderFooter({ selectedCount: 2 });
    const del = screen.getByRole("button", { name: /Delete selected \(2\)/ });
    fireEvent.click(del);
    expect(props.onDeleteSelected).toHaveBeenCalled();
  });

  it("hides the delete-selected button with no selection", () => {
    renderFooter({ selectedCount: 0 });
    expect(screen.queryByRole("button", { name: /Delete selected/ })).toBeNull();
  });

  it("disables save while saving", () => {
    renderFooter({ dirtyCount: 1, saving: true });
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  });
});
