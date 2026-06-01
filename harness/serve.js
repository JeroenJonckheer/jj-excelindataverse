/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { build, distDir } = require("./build");

const PORT = Number(process.env.HARNESS_PORT || 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function serve() {
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
  server.listen(PORT, () => {
    console.log(`Dataverse Spreadsheet harness ready on http://localhost:${PORT}`);
  });
}

build()
  .then(serve)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
