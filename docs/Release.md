# Release

A release is only built after `npm run verify` passes green.

## Versioning

The version lives in one place per layer and is kept in step:

- `Spreadsheet/services/version.ts` (shown in the footer)
- `Spreadsheet/ControlManifest.Input.xml` (`version`)
- `package.json` (`version`)
- `solution/src/Other/Solution.xml` (`Version`)

The control follows [Semantic Versioning](https://semver.org/) and starts at `0.1.0`.

## Build the solution

The solution builds both an unmanaged and a managed package (the `Managed` setting in `Solution.xml`
is `2`, meaning Both).

```bash
npm run build
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Release
```

The output zips are written under `solution/bin/Release/`.

## Publish a GitHub release

1. Make sure `npm run verify` is green and the version numbers match.
2. Build the solution as above.
3. Create a tag (for example `v0.1.0`) and a GitHub release.
4. Attach the managed solution zip as a release asset.
5. In the release notes, describe what changed and how to install and test it in your own
   environment.

## Install and test in your own environment

```bash
pac auth create --url https://YOURORG.crm.dynamics.com
pac solution import --path JJExcelInDataverse_managed.zip --publish-changes
```

Then add **Dataverse Spreadsheet** to a view or subgrid (see [Configuration](Configuration)) and
edit a few records to confirm the control works in your environment.
