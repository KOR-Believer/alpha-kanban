import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

// Model a legacy active worker that does not handle a newly introduced route.
// All state belongs to this isolated profile; no native folder or user tab is used.
const { values } = parseArgs({ options: { dir: { type: "string", default: "apps/web/dist-browser" } } });
const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, values.dir);
const release = JSON.parse(await readFile(resolve(directory, "release.json")));
const channel = release.channel ?? "stable";
const outputRoot = resolve(root, "output/playwright");
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(resolve(outputRoot, "pwa-entry-"));
let current = false;
const legacyInfo = { protocol: 1, mode: "app", ready: true, buildId: "aaaaaaaaaaaaaaaa", ...(channel === "canary" ? { channel } : {}) };
const types = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".zip": "application/zip" };
const server = createServer(async (request, response) => {
  let path = new URL(request.url, "http://local").pathname.slice(1);
  response.setHeader("Cache-Control", "no-store");
  if (path === "legacy-entry.html") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Legacy entry fixture</title><p>Isolated update fixture</p><button id="apply">Apply test update</button><p id="result"></p><script>
      navigator.serviceWorker.register('/sw.js', {scope:'/'});
      document.querySelector('#apply').onclick=async()=>{
        const worker=(await navigator.serviceWorker.getRegistration('/')).waiting;
        const channel=new MessageChannel();
        channel.port1.onmessage=e=>document.querySelector('#result').textContent=JSON.stringify(e.data);
        worker.postMessage({type:'AK_APPLY',protocol:1,channel:${JSON.stringify(channel)},buildId:${JSON.stringify(release.buildId)}},[channel.port2]);
      };
    </script>`); return;
  }
  if (!current && path === "sw.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>{if(e.data?.type==='AK_INFO')e.ports[0]?.postMessage(${JSON.stringify(legacyInfo)})});`); return;
  }
  if (!path || /^(about|intro|all|releases(?:\/[^/.]+)?|docs(?:\/[^/.]+)?)\/?$/.test(path)) path = "index.html";
  const file = resolve(directory, path);
  if (!file.startsWith(directory + sep)) { response.writeHead(400).end(); return; }
  try { response.setHeader("Content-Type", types[extname(file)] ?? "text/plain"); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let context, failure;
const report = { release: release.buildId, channel, checks: [], limitation: "Synthetic legacy worker in isolated Chrome; no native filesystem or user profile." };
try {
  context = await chromium.launchPersistentContext(resolve(output, "chrome-profile"), { channel: "chrome", headless: true });
  await context.addInitScript(() => { localStorage.setItem("alpha-kanban.theme", "dark"); localStorage.setItem("alpha-kanban.locale", "ko"); });
  const legacy = await context.newPage(); await legacy.goto(origin + "/legacy-entry.html");
  await legacy.waitForFunction(() => navigator.serviceWorker.controller);
  current = true;
  await legacy.evaluate(async () => { await (await navigator.serviceWorker.getRegistration("/")).update(); });
  await legacy.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration("/"))?.waiting));
  const page = await context.newPage(); let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(origin + "/releases/" + release.releaseId, { waitUntil: "commit" });
  await page.getByRole("heading", { name: "앱 업데이트를 확인해 주세요", exact: true }).waitFor();
  await new Promise((done) => setTimeout(done, 1500));
  assert.equal(navigations, 1, "A version mismatch must not automatically reload");
  assert.equal(await page.locator("html").getAttribute("class"), "dark");
  assert.equal(await page.getByRole("link", { name: "칸반 열기", exact: true }).getAttribute("href"), "/");
  await page.screenshot({ path: resolve(output, "guard.png") });
  report.checks.push("New route under a legacy worker remains on a still, themed update notice without automatic reload or workspace mounting");
  await legacy.getByRole("button", { name: "Apply test update", exact: true }).click();
  await page.getByRole("heading", { name: release.history.at(-1).title.ko, exact: true }).waitFor();
  await new Promise((done) => setTimeout(done, 750));
  assert.equal(navigations, 2, "Only a confirmed update commit reloads the page");
  assert.equal(await page.locator("html").getAttribute("class"), "dark");
  await page.screenshot({ path: resolve(output, "updated.png") });
  report.checks.push("The stopped page participates in a confirmed worker update and opens the requested release after one reload");
} catch (error) { failure = error; report.failure = error.stack; }
finally {
  await context?.close(); await new Promise((done) => server.close(done));
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  for (const check of report.checks) console.log("PASS", check);
  console.log("Evidence:", output);
}
if (failure) throw failure;
