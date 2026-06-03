# Validation

All validation rules come from the **Dataverse column metadata**. Nothing is invented or added beyond
what the metadata provides. When a piece of metadata is absent, the matching check is simply skipped.

## Rules and their source

| Rule | Source in the column metadata |
|---|---|
| Required | `RequiredLevel` (only `ApplicationRequired` / `SystemRequired` block saving) |
| Maximum length | `MaxLength` on text columns |
| Minimum / maximum | `MinValue` / `MaxValue` on numeric columns |
| Precision | `Precision` on numeric columns (whole numbers allow no decimals) |
| Email / phone / URL format | The text column's format (`Email`, `Phone`, `URL`) |
| Choice options | The option set - only values defined in the metadata are accepted |
| Lookup reference | The value must reference an existing record of the target table |
| Read-only | A column whose metadata reports it cannot be updated (calculated, rollup or otherwise server-computed) is shown read-only and cannot be edited |

## When validation runs

- **While typing or when leaving a cell** - immediate feedback on the edited cell.
- **Before saving** - a blocking pass over every changed cell. Saving stays disabled until all
  changed cells are valid. A new row is also checked for empty **required** fields before it is
  sent, so it is flagged in the grid rather than rejected by the server.

## How it looks

- An invalid cell gets a **red border**, with the message in a tooltip and in the footer.
- A valid editing field keeps its **white (#ffffff)** background.
- The **Save changes** button stays disabled while any changed cell is invalid.

## Server-side validation

Business rules and plugins run on the server. When you save, the control catches a rejection from
Dataverse, shows it on the right row, and keeps the rest of your changes so you can correct the row
and try again.
