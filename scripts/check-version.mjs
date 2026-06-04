/*
 * JJ - Excel in Dataverse - version sync gate.
 * Fails (non-zero) when the control version drifts across the four places that
 * must stay in step, so `npm run verify` catches it before a release.
 *   - Spreadsheet/services/version.ts   (CONTROL_VERSION, shown in the footer)
 *   - Spreadsheet/ControlManifest.Input.xml (control version=)
 *   - package.json                      (version)
 *   - solution/src/Other/Solution.xml   (<Version>, four-part)
 */
import { readFileSync } from "node:fs";

function find(file, re, label) {
  const m = re.exec(readFileSync(file, "utf8"));
  if (!m) {
    console.error(`check:version: could not read a version from ${label} (${file})`);
    process.exit(1);
  }
  return m[1];
}

const versionTs = find(
  "Spreadsheet/services/version.ts",
  /CONTROL_VERSION\s*=\s*"([\d.]+)"/,
  "version.ts",
);
const manifest = find(
  "Spreadsheet/ControlManifest.Input.xml",
  // Three-part version: skips the two-part `version="1.0"` XML declaration and
  // lands on the control's own version (which precedes the platform libraries).
  /version="(\d+\.\d+\.\d+)"/,
  "manifest",
);
const pkg = find("package.json", /"version":\s*"([\d.]+)"/, "package.json");
const solutionRaw = find(
  "solution/src/Other/Solution.xml",
  /<Version>([\d.]+)<\/Version>/,
  "Solution.xml",
);
const solution = solutionRaw.replace(/\.0$/, ""); // four-part -> three-part

const all = {
  "version.ts": versionTs,
  manifest,
  "package.json": pkg,
  "Solution.xml": solutionRaw,
};

if (!(versionTs === manifest && manifest === pkg && solution === versionTs)) {
  console.error("check:version: versions are OUT OF SYNC ->", JSON.stringify(all, null, 2));
  console.error(
    "Set all four to the same version (Solution.xml as four-part, e.g. " +
      `${versionTs}.0).`,
  );
  process.exit(1);
}

console.log(`check:version: all four in sync at ${versionTs}`);
