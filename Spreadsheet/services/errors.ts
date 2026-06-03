/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

/**
 * Extracts a human-readable message from whatever a failed save throws. The
 * Dataverse Web API can reject with an Error, with a plain object that carries a
 * `message`, or with a nested `{ error: { message } }`. This keeps the inline
 * row error meaningful instead of showing "[object Object]".
 */
export function serverErrorMessage(err: unknown): string {
  const fallback = "Saving this row failed.";
  if (err == null) return fallback;
  if (typeof err === "string") return err.trim() || fallback;
  if (err instanceof Error) return err.message || fallback;

  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
    const nested = obj.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // Circular or otherwise unserialisable: fall through to the fallback.
    }
  }
  return fallback;
}
