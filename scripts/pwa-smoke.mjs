import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/playwright/pwa-" + Date.now());
const exec = promisify(execFile);
await mkdir(output, { recursive: true });
await exec("node", ["scripts/package-browser-assets.mjs"], { cwd: root });
const versions = {};
for (const [name, mode] of [["a", "app"], ["b", "app"], ["recovery", "recovery"], ["retired", "retired"]]) {
  const dir = resolve(process.env.PWA_SMOKE_BUILD_DIR ?? output, name);
  if (!process.env.PWA_SMOKE_BUILD_DIR) {
    const build = await exec("pnpm", ["--filter", "@alpha-kanban/web", "exec", "vite", "build", "--mode", "browser", "--outDir", dir], {
      cwd: root, env: { ...process.env, AK_PWA_MODE: mode, AK_RELEASE_REVISION: `smoke-${name}` }, maxBuffer: 5 * 1024 * 1024,
    });
    await writeFile(resolve(output, `build-${name}.log`), build.stdout + build.stderr);
  }
  versions[name] = { dir, release: JSON.parse(await readFile(resolve(dir, "release.json"), "utf8")) };
  if (mode === "app") {
    const { assets } = JSON.parse(await readFile(resolve(dir, "offline-assets.json"), "utf8"));
    assert.equal(assets.filter((asset) => asset.url.endsWith(".zip")).length, 1);
    assert(assets.every((asset) => asset.integrity.startsWith("sha256-")));
    assert(!assets.some((asset) => /^(sw\.js|release\.json|repair\.)/.test(asset.url)));
  }
}
let serving = versions.a;
let badAsset = false;
let brokenWorker = false;
let networkUnavailable = false;
const network = [];
const contentTypes = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8" };
const headersText = await readFile(resolve(versions.a.dir, "_headers"), "utf8");
const csp = headersText.match(/Content-Security-Policy: (.+)/)[1];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://local");
  network.push({ method: request.method, path: url.pathname });
  if (networkUnavailable) { response.destroy(); return; }
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  if (url.searchParams.has("smoke-unresponsive")) { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Unresponsive app client</title><p>Unresponsive client</p>"); return; }
  if (url.pathname === "/other/sw.js") { response.setHeader("Content-Type", "application/javascript"); response.end("self.addEventListener('install',()=>self.skipWaiting());"); return; }
  if (url.pathname === "/sw.js" && brokenWorker) {
    response.setHeader("Content-Type", "application/javascript");
    response.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(Promise.resolve(new Response('<!doctype html><html><head><title>Stale worker</title></head><body>STALE WORKER</body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});");
    return;
  }
  let path = url.pathname.slice(1);
  if (!path || /^(intro|all|w\/[^/.]+)\/?$/.test(path)) path = "index.html";
  const file = resolve(serving.dir, path);
  if (!file.startsWith(serving.dir + "/")) { response.writeHead(400).end(); return; }
  try {
    if (badAsset && path.startsWith("assets/") && path.endsWith(".js")) {
      // Cloudflare's SPA fallback must not be accepted as a successfully cached JS file.
      response.setHeader("Content-Type", "text/html"); response.end("<html>wrong fallback</html>"); return;
    }
    const data = await readFile(file);
    response.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream");
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(output, "chrome-profile");
let context;
let installed = false;
const results = [];
const limitations = [];
let failure;
let chrome;
const record = (name) => { results.push(name); console.log("PASS", name); };
async function launch(offline = false) {
  return chromium.launchPersistentContext(profile, { channel: "chrome", headless: process.env.PWA_HEADED !== "1", offline, viewport: { width: 1360, height: 900 } });
}
async function until(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  do {
    try { if (await check()) return; }
    catch (error) { if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error; }
    await new Promise((done) => setTimeout(done, 150));
  } while (Date.now() < end);
  throw new Error("Timed out: " + label);
}
async function workerInfo(page, which = "active") {
  return page.evaluate(async (which) => {
    const worker = (await navigator.serviceWorker.getRegistration("/"))?.[which];
    if (!worker) return undefined;
    return new Promise((done) => {
      const channel = new MessageChannel(); const timer = setTimeout(() => done(undefined), 1200);
      channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); done(event.data); };
      worker.postMessage({ type: "AK_INFO", protocol: 1 }, [channel.port2]);
    });
  }, which);
}
async function updateWorker(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    await registration.update();
    const worker = registration.installing;
    if (!worker) return;
    await new Promise((resolve, reject) => {
      const check = () => {
        if (["installed", "activating", "activated"].includes(worker.state)) { worker.removeEventListener("statechange", check); resolve(); }
        if (worker.state === "redundant") { worker.removeEventListener("statechange", check); reject(new Error("Replacement worker failed to install")); }
      };
      worker.addEventListener("statechange", check); check();
    });
  });
}
async function openMenu(page) {
  const trigger = page.getByRole("button", { name: "앱 설치 및 업데이트" });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}
async function closeMenu(page) { await page.keyboard.press("Escape"); }
async function appVersion(page) { await openMenu(page); return page.getByText(/빌드 [a-f0-9]{16}/).innerText(); }
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((done, reject) => { const request = indexedDB.open("alpha-kanban.browser.v1", 1); request.onsuccess = () => done(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("records");
    const rows = await new Promise((done) => { const request = tx.objectStore("records").getAll(); request.onsuccess = () => done(request.result); });
    const keys = await new Promise((done) => { const request = db.transaction("records").objectStore("records").getAllKeys(); request.onsuccess = () => done(request.result); });
    db.close();
    return { records: keys.map((key, index) => [key, JSON.parse(JSON.stringify(rows[index], (name, value) => name === "lastOpenedAt" ? undefined : value instanceof FileSystemHandle ? { kind: value.kind, name: value.name } : value))]), settings: { ...localStorage } };
  });
}
async function original(page) { return page.evaluate(async () => {
  const project = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-project");
  return (await (await (await project.getDirectoryHandle("docs")).getFileHandle("01_smoke_tickets.md")).getFile()).text();
}); }
const fixture = `# PWA Smoke\n\n## Status\n- 현재 진행률: 0 / 1 tickets\n\n## Ticket List\n\n### PWA-01. Offline smoke ticket\n\nStatus: TODO\nProgress: 0%\nRepository:\n\n- smoke-project\n\nPriority: P1\nType: Feature\nDepends on:\n\n- 없음\n\n목표:\n\n- 오프라인 저장\n\n현재 문제:\n\n- 없음\n\n구현 범위:\n\n- 테스트\n\n제외 범위:\n\n- 없음\n\n완료 기준:\n\n- [ ] 확인\n\n검증:\n\n- [ ] 확인\n\n사용자 지시:\n\n진행 메모:\n`;

try {
  context = await launch();
  chrome = context.browser()?.version();
  context.on("weberror", (error) => console.log("Browser error", error.error().message));
  let page = context.pages()[0];
  await page.goto(origin);
  await until(async () => (await workerInfo(page))?.ready, "first offline installation");
  await page.reload();
  let installWindow;
  const installCdp = await context.newCDPSession(page);
  try {
    await installCdp.send("PWA.install", { manifestId: origin + "/", installUrlOrBundleUrl: origin + "/" });
    installed = true;
    await installCdp.send("PWA.changeAppUserSettings", { manifestId: origin + "/", displayMode: "standalone" });
    await installCdp.send("PWA.getOsAppState", { manifestId: origin + "/" });
    const opened = context.waitForEvent("page");
    await installCdp.send("PWA.launch", { manifestId: origin + "/", url: origin + "/intro" });
    installWindow = await opened; await installWindow.waitForLoadState();
    assert.equal(await installWindow.evaluate(() => matchMedia("(display-mode: standalone)").matches), true, "Chrome launched a browser tab, not a standalone app window");
    record("Chrome PWA installation and standalone route launch via CDP (not native prompt)");
  } catch (error) {
    limitations.push("Native installation: " + error.message); console.log("LIMIT", limitations.at(-1));
    await installWindow?.close();
    installWindow = undefined;
    if (installed) { await installCdp.send("PWA.uninstall", { manifestId: origin + "/" }); installed = false; }
  }
  await installCdp.detach();
  await page.evaluate(() => {
    localStorage.setItem("alpha-kanban.sidebarWidth", "312");
    localStorage.setItem("alpha-kanban.documentFilters", JSON.stringify({ hidePlainMarkdown: true, hideCompletedSets: true }));
    localStorage.setItem("alpha-kanban.ticketDetailMode", "modal");
    localStorage.setItem("alpha-kanban.ticketDetailWidth", "840");
    localStorage.setItem("alpha-kanban.ticketDetailModalSize", JSON.stringify({ width: 900, height: 680 }));
    localStorage.setItem("alpha-kanban.tours.v1.start", "completed");
    localStorage.setItem("alpha-kanban.tours.v1.board", "dismissed");
  });
  await page.reload();
  await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  await page.evaluate(async (fixture) => {
    const project = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-project", { create: true });
    const docs = await project.getDirectoryHandle("docs", { create: true });
    const file = await docs.getFileHandle("01_smoke_tickets.md", { create: true });
    const writable = await file.createWritable(); await writable.write(fixture); await writable.close();
    window.showDirectoryPicker = async () => project;
  }, fixture);
  await page.getByRole("button", { name: "프로젝트 열기", exact: true }).click();
  await page.getByText("Offline smoke ticket", { exact: true }).waitFor();
  const projectUrl = page.url();
  await page.evaluate(async () => {
    localStorage.setItem("alpha-kanban.locale", "ko");
    localStorage.setItem("alpha-kanban.allTickets.filters", JSON.stringify({ projectIds: [], hideDone: false, search: "" }));
    localStorage.setItem("pwa-smoke-setting", "preserve");
    const db = await new Promise((done) => { const request = indexedDB.open("alpha-kanban.browser.v1", 1); request.onsuccess = () => done(request.result); });
    await new Promise((done) => { const tx = db.transaction("records", "readwrite"); tx.objectStore("records").put({ id: "pending-smoke", fileId: "not-the-ticket", before: "original", intended: "uncertain" }, "recovery:pending-smoke"); tx.oncomplete = done; }); db.close();
    const cache = await caches.open("unrelated-app-cache"); await cache.put("/unrelated", new Response("kept"));
    await navigator.serviceWorker.register("/other/sw.js", { scope: "/other/" });
  });
  const before = await snapshot(page);
  record("Initial precache and persisted real FileSystem handles (OPFS, not OS picker)");
  await openMenu(page);
  await page.getByText("오프라인 사용 준비 완료", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "app-menu.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const popup = page.getByRole("dialog");
  const bounds = await popup.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.screenshot({ path: resolve(output, "app-menu-narrow.png") });
  await page.setViewportSize({ width: 1360, height: 900 });
  await closeMenu(page);
  const second = await context.newPage(); await second.goto(projectUrl);
  await second.getByText("Offline smoke ticket", { exact: true }).click();
  await second.getByRole("textbox", { name: "수동 지시", exact: true }).fill("잃으면 안 되는 초안");
  serving = versions.b;
  await openMenu(page); await page.getByRole("button", { name: "업데이트 확인", exact: true }).click();
  await until(async () => Boolean(await workerInfo(page, "waiting")), "waiting update");
  await page.getByRole("button", { name: "업데이트 적용", exact: true }).click();
  await page.getByText(/다른 앱 창의 작성 중인 내용도/).waitFor();
  assert.equal(await second.getByRole("textbox", { name: "수동 지시", exact: true }).inputValue(), "잃으면 안 되는 초안");
  assert.equal((await workerInfo(page)).buildId, versions.a.release.buildId);
  record("Other-tab draft prevents activation without losing its contents");
  await second.getByRole("textbox", { name: "수동 지시", exact: true }).fill("");
  await second.evaluate(() => {
    const createWritable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const writer = await createWritable.apply(this, args);
      const close = writer.close.bind(writer);
      writer.close = async () => { await new Promise((resolve) => { window.finishSmokeSave = resolve; }); await close(); };
      return writer;
    };
  });
  await second.getByRole("textbox", { name: "수동 지시", exact: true }).fill("업데이트 중 저장 보호");
  await second.getByRole("button", { name: "문서에 추가", exact: true }).click();
  await until(() => second.evaluate(() => Boolean(window.finishSmokeSave)), "write in progress");
  await page.getByRole("button", { name: "업데이트 적용", exact: true }).click();
  await page.getByText(/다른 앱 창의 작성 중인 내용도/).waitFor();
  assert.equal((await workerInfo(page)).buildId, versions.a.release.buildId);
  await second.evaluate(() => window.finishSmokeSave());
  await until(async () => (await original(page)).includes("[수동지시] 업데이트 중 저장 보호"), "save closed and verified");
  await until(async () => await second.getByRole("textbox", { name: "수동 지시", exact: true }).inputValue() === "", "saved draft cleared");
  const savedBeforeUpdate = await original(page);
  record("Active file write blocks update until close and readback verification");
  await second.keyboard.press("Escape");
  const unresponsive = await context.newPage();
  const unresponsiveCdp = await context.newCDPSession(unresponsive);
  await unresponsiveCdp.send("Network.setBypassServiceWorker", { bypass: true });
  await unresponsive.goto(origin + "/?smoke-unresponsive");
  await page.getByRole("button", { name: "업데이트 적용", exact: true }).click();
  await page.getByText(/다른 앱 창의 작성 중인 내용도/).waitFor();
  assert.equal((await workerInfo(page)).buildId, versions.a.release.buildId);
  await unresponsive.close();
  record("Unresponsive app client refuses activation instead of discarding work");
  await page.getByRole("button", { name: "업데이트 적용", exact: true }).click();
  await until(async () => (await workerInfo(page))?.buildId === versions.b.release.buildId, "controlled activation");
  await until(async () => (await page.locator("body").getAttribute("inert")) === null && await page.getByRole("button", { name: "앱 설치 및 업데이트" }).count() === 1, "updated page mounted");
  assert.match(await appVersion(page), new RegExp(versions.b.release.buildId));
  assert.match(await appVersion(second), new RegExp(versions.b.release.buildId));
  if (installWindow) {
    assert.match(await appVersion(installWindow), new RegExp(versions.b.release.buildId));
    await installWindow.screenshot({ path: resolve(output, "installed-updated.png") });
    await installWindow.close();
    record("Installed standalone window participates in the coordinated update");
  }
  await closeMenu(page); await closeMenu(second);
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await original(page), savedBeforeUpdate);
  record("Two-window update, connection/document IDs, settings and recovery preservation");

  await context.close(); context = await launch(true); page = context.pages()[0];
  if (installed) {
    const cdp = await context.newCDPSession(page);
    const opened = context.waitForEvent("page");
    await cdp.send("PWA.launch", { manifestId: origin + "/", url: origin + "/intro" });
    const window = await opened;
    await window.getByRole("heading", { name: "Alpha Kanban", exact: true }).waitFor();
    assert.equal(await window.evaluate(() => matchMedia("(display-mode: standalone)").matches), true);
    await window.close(); await cdp.detach();
    record("Installed app cold-launches offline after the Chrome process was closed");
  }
  await page.goto(origin + "/intro"); await page.getByRole("heading", { name: "Alpha Kanban", exact: true }).waitFor();
  await page.goto(origin + "/all"); await page.getByText("Offline smoke ticket", { exact: true }).waitFor();
  await page.goto(projectUrl); await page.getByText("Offline smoke ticket", { exact: true }).click();
  await page.getByRole("textbox", { name: "수동 지시", exact: true }).fill("오프라인 지시 저장");
  await page.getByRole("button", { name: "문서에 추가", exact: true }).click();
  await until(async () => (await original(page)).includes("[수동지시] 오프라인 지시 저장"), "offline file write");
  const afterWrite = await original(page);
  await page.keyboard.press("Escape");
  await openMenu(page); await page.screenshot({ path: resolve(output, "offline-menu.png") }); await closeMenu(page);
  record("Chrome cold restart offline, previously unvisited routes and verified local write (OPFS)");
  await context.setOffline(false);
  serving = versions.a; badAsset = true;
  await openMenu(page); await page.getByRole("button", { name: "업데이트 확인", exact: true }).click();
  await page.getByText(/새 앱 파일을 준비하지 못했습니다/).waitFor();
  assert.equal((await workerInfo(page)).buildId, versions.b.release.buildId);
  assert.equal(await original(page), afterWrite);
  record("Corrupt asset / SPA HTML fallback rejected; last complete app remains active");

  badAsset = false; serving = versions.b;
  await page.goto(origin + "/repair.html");
  await page.evaluate(async (buildId) => {
    const cache = await caches.open("alpha-kanban-app-v1-" + buildId);
    for (const key of await cache.keys()) if (new URL(key.url).pathname.endsWith(".js")) await cache.delete(key);
  }, versions.b.release.buildId);
  await page.getByRole("button", { name: "앱 파일 다시 받기" }).click();
  await page.getByText("앱 파일을 다시 받았습니다. 앱으로 돌아가세요.").waitFor({ timeout: 30000 });
  await page.getByRole("link", { name: "앱으로 돌아가기" }).click();
  await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  await openMenu(page); await page.getByText("최신 버전입니다", { exact: true }).waitFor(); await closeMenu(page);
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await original(page), afterWrite);
  record("Standalone repair restores missing app assets, not user data");

  brokenWorker = true;
  await updateWorker(page);
  // Restart the isolated Chrome profile, as the emergency runbook requires.
  await context.close(); context = await launch(); page = context.pages()[0];
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  assert.equal((await page.locator("body").innerText()).trim(), "STALE WORKER");
  brokenWorker = false; serving = versions.recovery;
  await updateWorker(page);
  await context.close(); context = await launch(); page = context.pages()[0]; await page.goto(origin);
  await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  assert.equal((await workerInfo(page)).mode, "recovery");
  assert.equal(await page.getByRole("button", { name: "앱 설치 및 업데이트" }).count(), 0);
  assert.deepEqual(await snapshot(page), before);
  record("Broken fetch interceptor replaced at the same URL after Chrome restart, without working app JavaScript");

  serving = versions.b;
  await updateWorker(page);
  await context.close(); context = await launch(); page = context.pages()[0]; await page.goto(origin);
  await until(async () => (await workerInfo(page))?.mode === "app", "normal app restored");
  await page.reload();
  await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  assert.deepEqual(await snapshot(page), before);
  record("Recovery deployment returns to the normal PWA without resetting connected data");

  serving = versions.retired;
  await updateWorker(page);
  await until(async () => (await workerInfo(page, "waiting"))?.mode === "retired", "retirement prepared");
  networkUnavailable = true;
  await context.setOffline(true);
  await context.close(); context = await launch(true); page = context.pages()[0]; await page.goto(origin);
  await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  assert.equal((await workerInfo(page)).mode, "retired");
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await original(page), afterWrite);
  record("Retirement activation offline retains a usable last complete app and user data");
  networkUnavailable = false;
  await context.close(); context = await launch(); page = context.pages()[0]; await page.goto(origin);
  await until(() => page.evaluate(async () => !(await navigator.serviceWorker.getRegistration("/"))), "retired registration removed");
  const left = await page.evaluate(async () => ({ caches: await caches.keys(), registrations: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) }));
  assert.deepEqual(left.caches, ["unrelated-app-cache"]);
  assert.deepEqual(left.registrations, [origin + "/other/"]);
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await original(page), afterWrite);
  record("Retirement leaves unrelated registrations, caches, handles, preferences and recovery intact");
  assert(network.every((request) => ["GET", "HEAD"].includes(request.method)));
  assert(!network.some((request) => request.path.startsWith("/api/")));
  assert(!network.some((request) => request.path.includes("smoke_tickets")));
  record("No local Markdown uploads or API requests");
  console.log("Evidence:", output);
} catch (error) {
  failure = error.stack;
  if (context) for (const [index, page] of context.pages().entries()) {
    await page.screenshot({ path: resolve(output, `failure-${index}.png`), timeout: 3000 }).catch(() => {});
    await writeFile(resolve(output, `failure-${index}.txt`), await page.locator("body").innerText({ timeout: 1000 }).catch(() => "unavailable"));
  }
  console.error("Evidence:", output);
  throw error;
} finally {
  if (installed && context) {
    try { await context.newCDPSession(context.pages()[0] ?? await context.newPage()).then((cdp) => cdp.send("PWA.uninstall", { manifestId: origin + "/" })); installed = false; }
    catch (error) { limitations.push("Test app cleanup failed: " + error.message); process.exitCode = 1; }
  }
  await context?.close();
  if (!installed && process.env.PWA_KEEP_PROFILE !== "1") await rm(profile, { recursive: true, force: true });
  await writeFile(resolve(output, "results.json"), JSON.stringify({ origin, chrome, results, limitations, failure, versions: Object.fromEntries(Object.entries(versions).map(([key, value]) => [key, value.release.buildId])), network }, null, 2));
  await new Promise((done) => server.close(done));
}
