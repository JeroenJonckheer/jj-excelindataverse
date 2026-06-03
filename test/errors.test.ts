/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import { serverErrorMessage } from "../Spreadsheet/services/errors";

describe("serverErrorMessage", () => {
  it("returns the message of an Error", () => {
    expect(serverErrorMessage(new Error("Boom"))).toBe("Boom");
  });
  it("returns a plain string", () => {
    expect(serverErrorMessage("Plugin blocked this")).toBe("Plugin blocked this");
  });
  it("reads a message off a plain object (Web API shape)", () => {
    expect(serverErrorMessage({ message: "Business rule failed" })).toBe(
      "Business rule failed",
    );
  });
  it("reads a nested error.message", () => {
    expect(
      serverErrorMessage({ error: { message: "Duplicate detected" } }),
    ).toBe("Duplicate detected");
  });
  it("falls back for null and empty objects", () => {
    expect(serverErrorMessage(null)).toBe("Saving this row failed.");
    expect(serverErrorMessage({})).toBe("Saving this row failed.");
  });
});
