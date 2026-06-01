# Configuration

JJ - Excel in Dataverse is a **dataset** control: it replaces the grid of a view or subgrid.

## Add the control to a subgrid or view

1. Open the **classic** form, view or dashboard designer (the Controls tab is most reliable there).
2. Select the **subgrid / list** you want to turn into a spreadsheet.
3. Open its properties -> **Controls** tab -> **Add control...** -> choose **JJ - Excel in Dataverse**.
4. Set it for **Web, Phone and Tablet** (tick all three - a common gotcha is enabling only one).
5. **Save & Publish.**

## Columns

The control reads its columns straight from the **view metadata**. To change which columns appear,
in what order, and how wide they are, edit the underlying view. The control distributes the columns
across the full available width using each column's relative width from the view.

## Properties

| Property | Required | Description |
|---|---|---|
| `pageSize` | | Number of records to load at once. Default is 100. |

There is intentionally little to configure: the editing behaviour and validation are driven entirely
by the column metadata, so the control adapts to whatever view you bind it to.

## Editable and read-only columns

- Editable inline: text, multiline text, whole number, decimal, currency, floating point, date,
  date and time, choice (option set), Yes/No, and simple lookups.
- Read-only: calculated and rollup columns, customer/owner/party-list lookups, and any column type
  the control does not yet edit. These still display, they just cannot be changed inline.

## Next step

See [Usage](Usage) for the core actions and keyboard shortcuts.
