# Development

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- The [.NET SDK](https://dotnet.microsoft.com)
- The [Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`)

## Scaffold

The control was scaffolded with:

```bash
pac pcf init --namespace Grids --name Spreadsheet --template dataset --framework react
```

## Scripts

```bash
npm install
npm run build          # compile and bundle the control
npm run start          # run the local PCF test harness
npm run lint           # ESLint
npm run typecheck      # TypeScript type checking
npm run test           # Jest unit and component tests
npm run test:coverage  # tests with the enforced coverage threshold
npm run harness:build  # build the offline harness used by the e2e tests
npm run test:e2e       # Playwright end-to-end tests
npm run verify         # lint, typecheck, coverage, build and e2e in order
```

## Project structure

```
Spreadsheet/
  ControlManifest.Input.xml   control definition and properties
  index.ts                    PCF entry point (Grids.Spreadsheet)
  components/                 React UI
    App.tsx                   shell: builds the model, wires the service
    SpreadsheetGrid.tsx       grid, selection, keyboard, paste, save
    CellEditor.tsx            text/number/date/choice/boolean editors
    LookupEditor.tsx          lookup autocomplete
    Footer.tsx                status, save action, version
  services/                   pure logic and Dataverse access
    types.ts                  shared domain types
    format.ts                 formatting and parsing helpers
    validation.ts             metadata-driven validation
    paste.ts                  Excel clipboard parsing
    navigation.ts             keyboard navigation logic
    columns.ts                data-type mapping and width distribution
    edit.ts                   resolves typed and pasted edits
    dataset.ts                adapters from the PCF dataset shape
    DataverseService.ts       metadata, lookup search and save
    version.ts                control version
  css/ - strings/             styling and localized labels
test/                         Jest unit and component tests
harness/                      offline harness (mock context + service)
e2e/                          Playwright tests
solution/                     Dataverse solution wrapper
```

## Conventions

- Every source file starts with a header containing `Author: Jeroen Jonckheer`.
- No emoji anywhere.
- Editing inputs use a white `#ffffff` background.
- The control version lives in `services/version.ts` and is mirrored in the manifest, the package
  and the solution. It is shown in the footer.
