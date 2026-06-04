# Built solution packages

Published, ready-to-import builds of the **JJ - Excel in Dataverse** control,
checked in per version. These are also attached to the matching GitHub Release
(tag `vX.Y.Z`).

- `JJExcelInDataverse_<version>_managed.zip` — managed (production) solution:
  minified bundle, no `eval`. Import this in a target environment.
- `JJExcelInDataverse_<version>_unmanaged.zip` — unmanaged (development)
  solution.

Build scratch lives under `solution/bin/` (gitignored); these files are the
deliberate, versioned copies. Rebuild with:

```
npm run build
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Release   # managed
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Debug     # unmanaged
```

Import a managed build:

```
pac solution import --path JJExcelInDataverse_<version>_managed.zip --publish-changes
```
