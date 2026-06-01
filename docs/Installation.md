# Installation

## Option A - import the ready-made solution (no build)

1. Download `JJExcelInDataverse_managed.zip` from the
   [latest release](https://github.com/JeroenJonckheer/jj-excelindataverse/releases/latest).
2. Import it into your environment:
   - **make.powerapps.com -> Solutions -> Import solution -> Browse ->** select the zip ->
     **Next -> Import**, or
   - with the [Power Platform CLI](https://aka.ms/PowerPlatformCLI):
     ```bash
     pac auth create --url https://YOURORG.crm.dynamics.com
     pac solution import --path JJExcelInDataverse_managed.zip --publish-changes
     ```
3. Publish all customizations.

## Option B - build from source

Prerequisites: [Node.js](https://nodejs.org) 18 or later, the
[.NET SDK](https://dotnet.microsoft.com), and the
[Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`).

```bash
git clone https://github.com/JeroenJonckheer/jj-excelindataverse.git
cd jj-excelindataverse
npm install
npm run build
dotnet build solution/JJExcelInDataverseSolution.cdsproj -c Release
pac solution import --path solution/bin/Release/JJExcelInDataverseSolution.zip --publish-changes
```

## Requirements

- A Dynamics 365 / Dataverse environment with Model-Driven Apps.
- The control uses the host-provided React 16 and Fluent UI 9 platform libraries, so nothing extra
  is bundled into your environment.

## Next step

Continue with [Configuration](Configuration) to add the control to a view or subgrid.
