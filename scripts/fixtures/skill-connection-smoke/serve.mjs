import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const app = resolve(root, "app");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const report = ["/report.html", "/build.json"].includes(path);
    let file = report ? resolve(root, "." + path) : resolve(app, "." + path);
    if (!report && file !== app && !file.startsWith(app + sep)) { response.writeHead(403).end(); return; }
    if (!report) {
      try { if (!(await stat(file)).isFile()) file = resolve(app, "index.html"); }
      catch { file = resolve(app, "index.html"); }
    }
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end("Not found"); }
}).listen(5251, "127.0.0.1", () => console.log("Chrome: http://127.0.0.1:5251/report.html\nKeep this window open. Ctrl+C stops the test server."));
