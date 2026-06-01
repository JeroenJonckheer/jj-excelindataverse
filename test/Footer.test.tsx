/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Footer } from "../Spreadsheet/components/Footer";

describe("Footer", () => {
  it("shows the version", () => {
    render(
      <Footer version="0.1.0" dirtyCount={0} errorCount={0} saving={false} message={null} onSave={jest.fn()} />,
    );
    expect(screen.getByText(/Dataverse Spreadsheet v0\.1\.0/)).toBeInTheDocument();
  });

  it("disables save with no changes", () => {
    render(
      <Footer version="0.1.0" dirtyCount={0} errorCount={0} saving={false} message={null} onSave={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getByText(/No pending changes/)).toBeInTheDocument();
  });

  it("disables save while there are validation errors", () => {
    render(
      <Footer version="0.1.0" dirtyCount={2} errorCount={1} saving={false} message="Bad value" onSave={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getByText("Bad value")).toBeInTheDocument();
  });

  it("enables save and calls onSave when clean and dirty", () => {
    const onSave = jest.fn();
    render(
      <Footer version="0.1.0" dirtyCount={3} errorCount={0} saving={false} message={null} onSave={onSave} />,
    );
    const button = screen.getByRole("button", { name: /Save changes/ });
    expect(button).toBeEnabled();
    expect(screen.getByText(/3 pending changes/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalled();
  });

  it("disables save while saving", () => {
    render(
      <Footer version="0.1.0" dirtyCount={1} errorCount={0} saving={true} message={null} onSave={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  });
});
