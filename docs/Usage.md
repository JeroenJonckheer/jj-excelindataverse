# Usage

## Editing a cell

- **Click** a cell to select it.
- **Double-click**, press **Enter** or press **F2** to start editing.
- Start **typing** on a selected cell to replace its content.
- For a choice or Yes/No column, a dropdown opens with the values from the option set.
- For a lookup column, start typing to search the target table and pick a record from the list.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Arrow keys | Move the selection between cells |
| Tab / Shift+Tab | Move to the next / previous cell, wrapping across rows |
| Enter / Shift+Enter | Move down / up |
| F2 or Enter | Start editing the selected cell |
| Escape | Cancel the current edit |
| Delete / Backspace | Clear the selected cell |
| Ctrl+Z / Ctrl+Y | Undo / redo the last change (including a paste) |

While editing, Enter and Tab commit the value and move on; Escape discards the change.

## Editing several rows at once

Every change is tracked as a pending edit. You can edit as many cells and rows as you like before
saving. The footer shows how many changes are pending.

## Adding rows

Click **Add row** in the footer to add an empty row at the bottom, then fill it
in. Pasting more rows than the grid currently has also adds the extra rows. New
rows are created in Dataverse when you Save; an empty row you never fill in is
ignored.

## Undo and redo

Press **Ctrl+Z** to undo the last change and **Ctrl+Y** (or Ctrl+Shift+Z) to redo
it. A paste counts as a single step, so one undo reverts the whole paste.

## Paste from Excel

1. Copy a block of cells in Excel (or any spreadsheet).
2. Select the top-left target cell in the grid.
3. Press **Ctrl+V**.

The block is mapped cell-for-cell from the selected cell, across columns and down rows, honouring
Excel's quoting for values that contain tabs or line breaks. Each pasted value is parsed and
validated just like a typed value.

## Saving

- Click **Save changes** in the footer to write all pending edits to Dataverse.
- Saving stays disabled until every changed cell is valid.
- If Dataverse rejects a row (for example a business rule or plugin), that row is highlighted and the
  message is shown, while your other changes are kept so you can fix and retry.

## Validation feedback

An invalid cell gets a red border and a tooltip with the reason; the footer shows the message too.
A valid editing field keeps its white background. See [Validation](Validation) for the full rules.
