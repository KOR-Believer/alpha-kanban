import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline";

const base = import.meta.dirname;
const port = Number(process.env.AK_SMOKE_PORT || 4197);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid AK_SMOKE_PORT");
let version = process.argv.includes("--b") ? "b" : "a";
const events = [];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end(); return; }
  const appRoot = resolve(base, "app-" + version);
  const root = /^\/native-(?:ab|boundaries)\.(html|js)$/.test(pathname) ? base : appRoot;
  if (/^\/(?:intro|all|w\/[^/.]+)?\/?$/.test(pathname)) pathname = "/index.html";
  const file = resolve(root, "." + pathname);
  if (!file.startsWith(root + "/") && !file.startsWith(root + "\\")) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const headers = await readFile(resolve(appRoot, "_headers"), "utf8");
    const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
    if (csp) response.setHeader("Content-Security-Policy", csp);
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    if (/\/(?:sw.js|release.json)$/.test(pathname)) events.push({ time: new Date().toISOString(), version, path: pathname });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
server.listen(port, "127.0.0.1", () => console.log(`Smoke app ${version}: http://127.0.0.1:${port}\nType a or b + Enter to switch test releases; q to stop.\nOnly app assets are served. Fixture files are opened through Chrome's folder picker.`));
const input = createInterface({ input: process.stdin });
input.on("line", async (line) => {
  const command = line.trim();
  if (command === "a" || command === "b") { version = command; console.log("Serving test release", version); }
  if (command === "q") { await writeFile(resolve(base, "server-events.json"), JSON.stringify(events, null, 2)); server.close(); input.close(); }
});
