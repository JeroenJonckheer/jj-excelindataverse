<div align="center">

# Dataverse Spreadsheet

### The spreadsheet experience Dataverse always should have had - edit your records inline, right inside the Model-Driven App.

[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f.svg)](LICENSE)
[![Power Platform](https://img.shields.io/badge/Power%20Platform-PCF%20control-742774.svg)](https://learn.microsoft.com/power-apps/developer/component-framework/overview)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made by Jeroen Jonckheer](https://img.shields.io/badge/made%20by-Jeroen%20Jonckheer-14b8a6.svg)](https://www.platformpower.nl)

_Demo recording is added with the first release._

*Type in cells, edit several rows at once, paste straight from Excel, pick lookups as you type - all saved to Dataverse, no export required.*

A spreadsheet-style **dataset control** for Microsoft Dynamics 365 / Dataverse, built as a
**PCF (Power Apps Component Framework)** control. Bind it to any view or subgrid and your users
get the fast, familiar grid they keep escaping to Excel for - without ever leaving the app.

</div>

## Why

Power Apps and Dynamics 365 users work with lists all day, yet the same pattern keeps repeating:
export to Excel, edit there, import back. The reason is the grid experience, not Dataverse itself.
A spreadsheet gives speed, direct entry and familiar behaviour that the standard grid lacks.

Dataverse Spreadsheet brings that experience straight into the Model-Driven App. The moment a user
thinks "let me just export this to Excel", the application has lost. This control makes sure that
thought never comes up.

## What it does

- **Inline cell editing** for text, number, date, choice and lookup columns.
- **Lookup autocomplete** - search the target table as you type and pick an existing record.
- **Keyboard navigation** with Tab, Enter and the arrow keys, the way a spreadsheet works.
- **Paste from Excel** across many cells and rows at once, including Excel's quoting rules.
- **Metadata-driven validation** - required, maximum length, numeric minimum, maximum and
  precision, email, phone and URL formats, choice options and lookup references. Nothing is
  invented beyond what the column metadata provides.
- **Save to Dataverse** with a blocking per-cell validation pass, and server-side rejections
  (business rules, plugins) shown on the right row while the other changes are kept.
- **Automatic column distribution** across the full width.
- A calm, standard Dynamics 365 look: the same font and sizing, a white editing background and
  the control version in the footer.

## Who it is for

Makers and administrators who manage Dataverse data in Model-Driven Apps and want a faster, in-app
way to edit lists - bulk updates, data clean-up, quick triage - without exporting to Excel.

## Install

### Option A - import the ready-made solution (no build)

1. Download `JJExcelInDataverse_managed.zip` from the [latest release](../../releases/latest).
2. Import it: **make.powerapps.com -> Solutions -> Import solution**, or with the Power Platform CLI:
   ```bash
   pac auth create --url https://YOURORG.crm.dynamics.com
   pac solution import --path JJExcelInDataverse_managed.zip --publish-changes
   ```
3. Add **Dataverse Spreadsheet** to a view or subgrid (see Configuration).

### Option B - build from source

Requires [Node.js](https://nodejs.org), the [.NET SDK](https://dotnet.microsoft.com) and the
[Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`).

```bash
npm install
npm run build                                                       # build the control
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Release # build the managed solution
pac solution import --path solution/bin/Release/JJExcelInDataverseSolution.zip --publish-changes
```

The control uses the host-provided **React 16** and **Fluent UI 9** platform libraries.

## Configuration

Dataverse Spreadsheet is a **dataset** control, so it replaces the grid of a view or subgrid.

1. Open the classic form, view or dashboard designer.
2. Select the **subgrid / list** you want to turn into a spreadsheet.
3. Open its properties -> **Controls** tab -> **Add control...** -> choose **Dataverse Spreadsheet**.
4. Enable it for **Web, Phone and Tablet**.
5. **Save & Publish.**

The columns come from the view metadata, so you arrange the columns by editing the view itself.
There is one optional property, `pageSize`, controlling how many records load at once (default 100).

## Features in version 1

| Area | Capability |
|---|---|
| Editing | Inline editing for text, number, date, choice and lookup |
| Lookups | Type-ahead autocomplete, selection of an existing record |
| Keyboard | Tab, Enter and arrow-key navigation |
| Paste | Multi-cell, multi-row paste from Excel |
| Validation | Required, length, min/max, precision, email/phone/URL, choice and lookup - all from metadata |
| Saving | Per-cell validation gate, server-side rejection handling per row |
| Layout | Automatic full-width column distribution, white #ffffff editing background, version in footer |

## Roadmap

Planned for later versions:

- Virtual scrolling for very large datasets
- Frozen (pinned) columns
- Column reordering
- Totals and summaries
- Conditional formatting
- Remembered personal layouts

## Documentation

Full documentation lives in the [project wiki](../../wiki) and, as a backup, under [docs/](docs).

## Customization and commercial support

Dataverse Spreadsheet is free and open source (MIT). Need it tailored to your organisation - extra
column types, bespoke behaviour, a configuration UI, or integration with your processes? I take on
paid customization and support.

**Jeroen Jonckheer** - [platformpower.nl](https://www.platformpower.nl) - [LinkedIn](https://www.linkedin.com/in/jeroen-jonckheer/)

## Contributing

Issues and pull requests are welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) (c) 2026 Jeroen Jonckheer
