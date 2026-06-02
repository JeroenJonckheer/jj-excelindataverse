# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-06-01

First release of JJ - Excel in Dataverse.

### Added
- Spreadsheet-style dataset PCF control (`jj_Grids.Spreadsheet`) for Model-Driven Apps.
- Inline cell editing for text, number, date, choice and lookup columns.
- Lookup autocomplete with type-ahead search and selection of an existing record.
- Lookup resolution on paste: pasted text is matched to a record by primary name
  (trimmed, case-insensitive) or by GUID; no match or several matches mark the
  cell invalid; values are resolved once and cached for large pastes.
- Keyboard navigation with Tab, Enter and the arrow keys.
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
- Automatic column distribution across the full width.
- White (#ffffff) editing background and the control version in the footer.
- Layered test suite: Jest unit tests, React Testing Library component tests and
  Playwright end-to-end tests against an offline harness.
- Buildable unmanaged and managed solutions (`solution/`).
