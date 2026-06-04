/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 *
 * Builds and serves the offline harness for the demo recording, on its own port
 * so it never clashes with the e2e harness. Reuses the same esbuild build.
 */
import http from "http";
import fs from "fs";
import path from "path";
const { build, distDir } = require("../harness/build") as {
  build: () => Promise<void>;
  distDir: string;
};

const PORT = Number(process.env.DEMO_PORT || 5174);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

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
  console.log(`Demo harness ready on http://localhost:${PORT}`);
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
