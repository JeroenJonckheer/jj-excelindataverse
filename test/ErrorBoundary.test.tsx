/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../Spreadsheet/components/ErrorBoundary";

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error("kaboom in a cell");
  return <div>healthy grid</div>;
}

describe("ErrorBoundary", () => {
  // The thrown error is expected; silence React's error logging for these tests.
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy grid")).toBeInTheDocument();
  });

  it("shows a fallback with the error message instead of a white screen", () => {
    render(
      <ErrorBoundary>
        <Boom explode={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getByText(/kaboom in a cell/)).toBeInTheDocument();
  });

  it("calls onReload when the Reload button is clicked", () => {
    const onReload = jest.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Boom explode={true} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
