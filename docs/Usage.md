# Usage

## Editing a cell

- **Click** a cell to select it.
- Press **Enter** or **F2** to start editing.
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
| Down arrow on the last row | Add a new row |
| Ctrl+Z / Ctrl+Y | Undo / redo the last change (including a paste) |

While editing, Enter and Tab commit the value and move on; Escape discards the change.

## Editing several rows at once

Every change is tracked as a pending edit. You can edit as many cells and rows as you like before
saving. The footer shows how many changes are pending.

## Adding rows

To add a row, scroll past the bottom of the grid, or press the down arrow on the
last row - a new empty row appears, the way a spreadsheet keeps going. Pasting
more rows than the grid currently has also adds the extra rows. New rows are
created in Dataverse when you Save; an empty row you never fill in is ignored.

## Pasting into lookup columns

A spreadsheet cell only holds text, while a lookup stores a reference to a record.
When you paste text into a lookup column the control resolves it to a record by
the primary name (trimmed, case-insensitive) or by a GUID:

- One match: the lookup is linked and the cell shows the record name.
- No match: the cell is invalid; clear it or correct the text.
- Several matches: the cell is invalid; open it to choose the right record.
- Empty: the lookup is cleared.

Repeated values across a large paste are resolved once and cached, so pasting
many rows stays fast. An unresolved or ambiguous lookup is an invalid cell and
blocks saving until it is fixed.

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

## Sorting, resizing and the view

- **Sort** by clicking a column header; click again to reverse. Sorting runs on
  the dataset (server-side), so it respects the view filter and large datasets.
- **Resize** a column by dragging the right edge of its header.
- The grid takes its **columns and filter from the bound view**. Change the view
  (or its column layout or filter, or pick another view in the selector) and the
  grid updates to match.

## Selecting, deleting and opening records

- The leading checkbox column selects whole rows; the header checkbox selects all.
- **Delete selected** in the footer removes the selected rows. New, unsaved rows
  disappear immediately; saved records are marked for deletion (shown struck
  through) and removed from Dataverse when you Save. Press **Ctrl+Z** to undo a
  deletion mark before saving.
- **Right-click** a row for a menu with **Open record** and **Delete**.
- **Double-click** a row to open the underlying record in the app.

## Saving

- Click **Save changes** in the footer to write all pending edits to Dataverse.
- Saving stays disabled until every changed cell is valid.
- If Dataverse rejects a row (for example a business rule or plugin), that row is highlighted and the
  message is shown, while your other changes are kept so you can fix and retry.

## Validation feedback

An invalid cell gets a red border and a tooltip with the reason; the footer shows the message too.
A valid editing field keeps its white background. See [Validation](Validation) for the full rules.
