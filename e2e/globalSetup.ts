/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import http from "http";
import fs from "fs";
import path from "path";
const { build, distDir } = require("../harness/build") as {
  build: () => Promise<void>;
  distDir: string;
};

const PORT = Number(process.env.HARNESS_PORT || 5173);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/**
 * Builds the harness and serves it from within the Playwright runner process,
 * then returns a teardown that closes the server. Hosting the server in-process
 * (instead of Playwright's webServer child) avoids the Windows process-tree kill
 * that can leave the runner hanging after the tests finish.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  await build();

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || "/").split("?")[0];
    const rel = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = path.join(distDir, path.normalize(rel));
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    });
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Harness ready on http://localhost:${PORT}`);

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
