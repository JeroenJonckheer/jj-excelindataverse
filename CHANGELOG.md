# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.10.1] - 2026-06-04

### Fixed
- Date parsing now reads day-first (dd/MM/yyyy, also with `.`/`-` separators and
  an optional time), matching the Dutch/European locale, instead of the US
  month-first interpretation that rejected days > 12 and silently mis-parsed the
  rest. ISO and unambiguous month-first dates still parse; impossible dates are
  rejected rather than rolling over.

## [0.10.0] - 2026-06-03

### Added
- Dataset paging: footer controls (previous / next, with a loaded-of-total count)
  to move through views with more records than one page, wired to the dataset
  paging API. The maker's Page size property is applied to the dataset. Pending
  edits are kept across page navigation.

## [0.9.0] - 2026-06-03

### Added
- Find & replace: Ctrl+F opens a find bar (top-right), Ctrl+H opens it with
  replace. Matches are highlighted and navigable (Enter / Shift+Enter), with
  match-case and whole-cell options. Replace and Replace all write pending edits
  (saved and undoable like any edit); read-only and lookup cells are found but
  not replaced.

### Removed
- The per-column filter funnel UI (it did not earn its place); the filter logic
  stays in the code, dormant and unit-tested, for a future iteration.

## [0.8.0] - 2026-06-03

### Added
- Per-column quick filter: a funnel in the column header opens a small panel
  ("contains" for text, from/to for numbers and dates, a checkbox list for choice
  and yes/no). Filtering runs server-side via the dataset filtering API, so the
  whole dataset is filtered, not just the loaded page.

## [0.7.1] - 2026-06-03

### Removed
- The footer "Save as personal view" button. A PCF control cannot add to the
  host's view selector or show the modified-view star, so the in-footer save felt
  out of place. The underlying capability (DataverseService.savePersonalView)
  stays in place but is no longer surfaced.

## [0.7.0] - 2026-06-03

### Added
- Save as personal view: after reordering, resizing or freezing columns, a
  "Save as personal view" button appears in the footer. Naming it creates a
  Dataverse personal view (userquery) with the column order, widths and sort
  (fetchxml + layoutxml), so it shows up for the user in the view selector.

## [0.6.3] - 2026-06-03

### Changed
- The freeze pin is now the standard push-pin icon (Material "push_pin"): an
  outline when the column is free, filled blue when frozen.

## [0.6.2] - 2026-06-03

### Changed
- The freeze control is now a clear thumbtack (pin) icon drawn as inline SVG,
  instead of the earlier teardrop shape.

## [0.6.1] - 2026-06-03

### Changed
- Frozen columns are now opt-in and configurable: hover a column header and click
  the pin to freeze all columns up to and including it (and the selection
  column); click again to unfreeze. Nothing is frozen by default.

## [0.6.0] - 2026-06-03

### Added
- The first column (and the row-selection column) stays frozen while scrolling
  the grid horizontally, like a spreadsheet's frozen first column.

## [0.5.0] - 2026-06-03

### Added
- Reorder columns by dragging a column header onto another (a blue line marks
  where it lands). The new order flows through the header, cells, widths, paste
  and navigation.
- Auto-fit a column by double-clicking the right edge of its header: it sizes to
  the header and the visible cell contents.

## [0.4.2] - 2026-06-03

### Changed
- An edit that returns a cell to its original saved value is no longer kept as a
  pending change: the dirty marker, the pending count and the save all drop the
  no-op edit (invalid cells and pending lookups are still kept).

## [0.4.1] - 2026-06-03

### Changed
- Fill handle now frames the whole series like Excel: the selection outline grows
  to include the target cells while dragging, and after release the entire range
  (source plus filled cells) stays selected.

## [0.4.0] - 2026-06-03

### Added
- New rows show the default values from the column metadata (choice and yes/no
  columns); the server applies them on create, so they are display-only and an
  untouched new row is still ignored.
- Duplicate row: a right-click menu action that starts a new, unsaved row
  pre-filled with the source row's editable values (read-only columns skipped).

## [0.3.0] - 2026-06-03

### Added
- Read-only columns are derived from metadata: a column whose metadata reports it
  cannot be updated (calculated, rollup or otherwise server-computed) is shown
  read-only instead of being editable.
- Required fields are validated before a new row is sent: a new row with an empty
  required field is blocked with an inline error instead of failing at the server.

### Changed
- A rejected save now shows the server's message inline on the row (business rule,
  plugin or duplicate detection), instead of a generic or "[object Object]" text.

## [0.2.0] - 2026-06-03

First release of JJ - Excel in Dataverse. The footer shows the version, which is
bumped on every deployed change so it is clear which build is in front of you.

### Added
- Spreadsheet-style dataset PCF control (`jj_Grids.Spreadsheet`) for Model-Driven Apps.
- Inline cell editing for text, number, date, choice and lookup columns.
- Lookup autocomplete with type-ahead search and selection of an existing record.
- Lookup resolution on paste: pasted text is matched to a record by primary name
  (trimmed, case-insensitive) or by GUID; no match or several matches mark the
  cell invalid; values are resolved once and cached for large pastes. Matching is
  lenient about casing and extra whitespace, so a pasted name resolves the same
  way the type-ahead picker would.
- Lookup values render as Dataverse-style links (blue, underlined on hover);
  clicking one opens the referenced record.
- Keyboard navigation with Tab, Enter and the arrow keys.
- Fill handle: drag the bottom-right corner of the selection up or down to fill
  the column - numbers extrapolate as a series (a single number copies), other
  column types repeat the selected values.
- Rectangular cell selection (Shift+click, Shift+Arrow, mouse drag), with an
  Excel-style status-bar summary (count, sum, average of the numeric cells),
  Ctrl+C copy of the range as tab-separated text and an HTML table, and Delete
  to clear every editable cell in the selection.
- Paste from Excel across multiple cells and rows. The clipboard's HTML table is
  used when present (robust to Excel Protected View and to copy paths that drop
  row separators), with plain-text parsing and a column-count based row
  reconstruction as fallbacks. A paste that runs past the end of the grid adds
  new rows instead of dropping data.
- Add new rows by scrolling past the bottom or pressing the down arrow on the
  last row, and create them in Dataverse on save.
- Select rows with a leading checkbox column and delete them - via a footer
  button or a right-click context menu. New rows are dropped immediately; saved
  records are removed from Dataverse on save (and Ctrl+Z reverts the mark).
- Double-click a row to open the underlying record in the host app; right-click
  offers Open record and Delete.
- Sort by clicking a column header (server-side via the dataset, so it respects
  the view filter and works on large datasets).
- Resize columns by dragging the right edge of a header.
- Choice and boolean cells edit with a native dropdown (with its caret) that
  opens on a single click, so the browser positions the list correctly.
- The column header stays frozen while scrolling the grid vertically.
- The view's columns and filter flow straight through: changing the view, its
  column layout or its filter is reflected in the grid.
- Undo and redo (Ctrl+Z / Ctrl+Y) for edits, deletes and pastes; undo also
  removes rows that a paste created, leaving no empty leftover rows.
- Only the view's layout columns are shown (non-layout columns are hidden).
- Metadata-driven validation: required level, maximum length, numeric minimum,
  maximum and precision, email, phone and URL formats, choice options and lookup
  references. No rules are invented beyond what the column metadata provides.
- Save to Dataverse per record, with per-cell validation gating and server-side
  rejection handling that keeps the remaining changes.
- Column widths follow the view: each column uses its configured pixel width
  and the grid scrolls horizontally when they do not fit; when there is room to
  spare the columns stretch proportionally to fill the width (keeping their
  relative sizes), the way the standard Dynamics grid does.
- White (#ffffff) editing background and the control version in the footer.
- Layered test suite: Jest unit tests, React Testing Library component tests and
  Playwright end-to-end tests against an offline harness.
- Buildable unmanaged and managed solutions (`solution/`).
