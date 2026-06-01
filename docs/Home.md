# JJ - Excel in Dataverse - Wiki

**The spreadsheet experience Dataverse always should have had - edit your records inline, right inside the Model-Driven App.**

JJ - Excel in Dataverse is a [PCF](https://learn.microsoft.com/power-apps/developer/component-framework/overview)
(Power Apps Component Framework) **dataset control** for Microsoft Dynamics 365 / Dataverse. Bind it
to any view or subgrid and your users get a fast, familiar grid: type in cells, edit several rows at
once, paste from Excel, pick lookups as you type, and every change is validated and saved straight
back to Dataverse.

> Control id: `jj_Grids.Spreadsheet` - publisher prefix `jj` - virtual React control.

## Start here

- **[Installation](Installation)** - import the managed solution or build from source.
- **[Configuration](Configuration)** - add the control to a view or subgrid.
- **[Usage](Usage)** - the core actions and keyboard shortcuts.
- **[Validation](Validation)** - how the rules come from the column metadata.
- **[Development](Development)** - scaffold, scripts and project structure.
- **[Testing](Testing)** - the layered test strategy and the repeatable cycle.
- **[Release](Release)** - building the managed solution and publishing a release.

## At a glance

| | |
|---|---|
| **Surfaces** | Model-driven views and subgrids |
| **Editable types** | Text, number, date, choice, lookup |
| **Lookups** | Type-ahead autocomplete, existing-record selection |
| **Paste** | Multi-cell, multi-row paste from Excel |
| **Validation** | Required, length, min/max, precision, email/phone/URL, choice, lookup - all from metadata |
| **Persistence** | Per-cell validation gate, server-side rejection handling per row |
| **Platform libs** | React 16, Fluent UI 9 (host-provided) |
| **Licence** | MIT |

## Links

- Repository: <https://github.com/JeroenJonckheer/jj-excelindataverse>
- Latest release: <https://github.com/JeroenJonckheer/jj-excelindataverse/releases/latest>
- Maintainer: **Jeroen Jonckheer** - [platformpower.nl](https://www.platformpower.nl) - [LinkedIn](https://www.linkedin.com/in/jeroen-jonckheer/)
