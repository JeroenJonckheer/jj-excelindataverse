# Contributing to JJ - Excel in Dataverse

Thanks for taking the time to contribute. Bug reports, ideas and pull requests
are all welcome.

## Reporting bugs and requesting features

Please open an [issue](../../issues/new/choose) using one of the templates. For
bugs, include your environment (Dynamics / Dataverse version), the view or
subgrid the control is bound to, the column types involved, and the steps to
reproduce.

## Development setup

Prerequisites: [Node.js](https://nodejs.org) 18 or later, the
[.NET SDK](https://dotnet.microsoft.com), and the
[Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`).

```bash
npm install
npm run build        # compile and bundle the control
npm run verify       # lint, typecheck, unit and component tests, build, e2e
```

To produce an importable solution:

```bash
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Release
```

## Verification cycle

Every change must pass `npm run verify` before it is merged. The same command
runs in GitHub Actions on every push and pull request.

| Command | Purpose |
|---|---|
| `npm run lint` | ESLint over the control and tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Jest unit and component tests |
| `npm run test:coverage` | Tests with the enforced coverage threshold |
| `npm run test:e2e` | Playwright end-to-end tests against the harness |
| `npm run verify` | All of the above plus the build, in order |

## Tests travel with the change

Every functional addition or change ships with repeatable test steps for that
change, at the level that proves it:

- pure logic gets a unit test (for example `selection.ts`, `fill.ts`);
- component behaviour gets a React Testing Library test;
- anything that depends on real browser events - mouse drag, the fill handle,
  clipboard copy/paste - gets a Playwright end-to-end test in `e2e/`.

The whole suite is repeatable and runs from one command (`npm run verify`), so a
feature is not done until its tests are in and green. Also bump the version (see
[version.ts](Spreadsheet/services/version.ts) and the manifest) on every
deployed change, so the footer makes the live build obvious.

## Pull requests

1. Fork the repo and create a topic branch (`feature/...` or `fix/...`).
2. Keep changes focused and match the existing TypeScript style and layout.
3. Make sure `npm run verify` passes.
4. Describe the change and the use case in the pull request.

## Coding conventions

- Every source file starts with a header containing `Author: Jeroen Jonckheer`.
- No emoji anywhere - code, logging, messages or documentation.
- Editing inputs use a white `#ffffff` background.
- Validation rules come only from the Dataverse column metadata.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
