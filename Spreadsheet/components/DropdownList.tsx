/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { createPortal } from "react-dom";

export interface DropdownListProps {
  /** An element inside the editing cell; the list is anchored under its cell. */
  anchorRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

/**
 * Renders a dropdown list in a portal at the document body, positioned just
 * under the editing cell. Rendering outside the grid avoids the cell's
 * overflow:hidden and the grid's overflow:auto clipping the list (or forcing a
 * scrollbar), so the options always show in full.
 */
export const DropdownList: React.FC<DropdownListProps> = ({ anchorRef, children }) => {
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Position under the editing cell, measured before paint so it appears in the
  // right place from the first frame.
  React.useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const cell = (el.closest("td") as HTMLElement | null) ?? el;
    const rect = cell.getBoundingClientRect();
    setPos({ top: rect.bottom, left: rect.left, width: rect.width });
  }, [anchorRef]);

  if (typeof document === "undefined") return <>{children}</>;

  return createPortal(
    <ul
      className="jj-sheet-dropdown"
      role="presentation"
      style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width }}
    >
      {children}
    </ul>,
    document.body,
  );
};
