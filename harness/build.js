/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distDir = path.resolve(__dirname, "dist");

async function build() {
  fs.mkdirSync(distDir, { recursive: true });

  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "harness.tsx")],
    bundle: true,
    outfile: path.resolve(distDir, "bundle.js"),
    platform: "browser",
    format: "iife",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    loader: { ".tsx": "tsx", ".ts": "ts" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "info",
  });

  fs.copyFileSync(
    path.resolve(__dirname, "index.html"),
    path.resolve(distDir, "index.html"),
  );
  fs.copyFileSync(
    path.resolve(root, "Spreadsheet", "css", "Spreadsheet.css"),
    path.resolve(distDir, "Spreadsheet.css"),
  );
}

module.exports = { build, distDir };

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
