import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { unzipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/playwright/pwa-" + Date.now());
const exec = promisify(execFile);
await mkdir(output, { recursive: true });
await exec("node", ["scripts/package-browser-assets.mjs"], { cwd: root });
const versions = {};
const authoredRelease = JSON.parse(await readFile(resolve(root, "apps/web/releases.json"), "utf8")).at(-1);
const noteA = { id: "smoke-a", sequence: 1, date: "2026-10-25", notify: true, notes: { ko: ["이전 테스트 릴리즈"], en: ["Previous test release"] } };
// Exercise the explicitly compatible branch with controlled snapshots. Production
// releases can correctly remain unknown; they must not decide this fixture's path.
const noteB = { ...authoredRelease, id: "smoke-b", sequence: 2, notes: { ko: ["적용 대상 B의 변경 내용", ...authoredRelease.notes.ko], en: ["Changes in prepared release B", ...authoredRelease.notes.en] }, skill: { compatibility: "compatible", notes: { ko: ["격리 테스트 스냅샷"], en: ["Isolated test snapshots"] } } };
for (const [name, mode] of [["a", "app"], ["b", "app"], ["recovery", "recovery"], ["retired", "retired"]]) {
  const dir = resolve(process.env.PWA_SMOKE_BUILD_DIR ?? output, name);
  if (!process.env.PWA_SMOKE_BUILD_DIR) {
    const notesFile = resolve(output, `notes-${name}.json`);
    await writeFile(notesFile, JSON.stringify(name === "a" ? [noteA] : [noteA, noteB]));
    const build = await exec("pnpm", ["--filter", "@alpha-kanban/web", "exec", "vite", "build", "--outDir", dir], {
      cwd: root, env: { ...process.env, AK_PWA_MODE: mode, AK_RELEASE_REVISION: `smoke-${name}`, AK_RELEASE_NOTES_FILE: notesFile }, maxBuffer: 5 * 1024 * 1024,
    });
    await writeFile(resolve(output, `build-${name}.log`), build.stdout + build.stderr);
  }
  versions[name] = { dir, release: JSON.parse(await readFile(resolve(dir, "release.json"), "utf8")) };
  if (mode === "app") {
    const { assets } = JSON.parse(await readFile(resolve(dir, "offline-assets.json"), "utf8"));
    assert.deepEqual(assets.filter((asset) => asset.url.endsWith(".zip")).map((asset) => asset.url), [`downloads/implementation-ledger-${versions[name].release.skillBundle}.zip`]);
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
async function downloadSkill(page, version, label) {
  const archive = `implementation-ledger-${version.release.skillBundle}.zip`;
  await page.getByRole("button", { name: "설치 요청문 확인·복사", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("summary").filter({ hasText: "직접 설치 안내" }).click();
  const link = dialog.getByRole("link", { name: "Codex 스킬 다운로드", exact: true });
  assert.equal(await link.getAttribute("href"), `/downloads/${archive}`);
  const fetched = page.waitForResponse((response) => response.url() === `${origin}/downloads/${archive}`);
  const downloaded = page.waitForEvent("download");
  await link.click();
  const response = await fetched;
  assert.equal(response.status(), 200);
  assert.equal(response.fromServiceWorker(), true, "Offline ZIP must be served by the running worker");
  const download = await downloaded;
  assert.equal(await download.failure(), null);
  assert(download.url().startsWith(`blob:${origin}/`));
  assert.equal(download.suggestedFilename(), archive);
  const target = resolve(output, `skill-${label}.zip`);
  await download.saveAs(target);
  const bytes = await readFile(target);
  const expected = await readFile(resolve(version.dir, "downloads", archive));
  const digest = (content) => createHash("sha256").update(content).digest("hex");
  assert.equal(digest(bytes), digest(expected), "Downloaded ZIP must match the running build");
  const files = unzipSync(bytes);
  const payload = JSON.parse(await readFile(resolve(version.dir, "downloads", `implementation-ledger-${version.release.skillBundle}.json`), "utf8"));
  assert.deepEqual(Object.keys(files).sort(), ["INSTALL.txt", ...payload.files.map((file) => `implementation-ledger/${file.path}`)].sort());
  for (const file of payload.files) assert.equal(digest(files[`implementation-ledger/${file.path}`]), file.sha256, file.path);
  assert(Buffer.from(files["INSTALL.txt"]).toString("utf8").includes(`Bundle version: ${version.release.skillBundle}`));
  await page.keyboard.press("Escape");
}
async function assertThemeColor(page, surface, dark) {
  await page.waitForFunction(({ surface, dark }) => {
    const root = document.documentElement;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    const headerToken = surface === "--ak-surface" ? "--ak-header-surface" : "--ak-header-background";
    const color = getComputedStyle(root).getPropertyValue(headerToken).trim();
    return root.classList.contains("dark") === dark && metas.length === 1 &&
      !metas[0].hasAttribute("media") && metas[0].content === color && CSS.supports("color", color);
  }, { surface, dark });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((done, reject) => { const request = indexedDB.open("alpha-kanban.browser.v1", 1); request.onsuccess = () => done(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("records");
    const rows = await new Promise((done) => { const request = tx.objectStore("records").getAll(); request.onsuccess = () => done(request.result); });
    const keys = await new Promise((done) => { const request = db.transaction("records").objectStore("records").getAllKeys(); request.onsuccess = () => done(request.result); });
    db.close();
    return { records: keys.map((key, index) => [key, JSON.parse(JSON.stringify(rows[index], (name, value) => name === "lastOpenedAt" ? undefined : value instanceof FileSystemHandle ? { kind: value.kind, name: value.name } : value))]), settings: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith("alpha-kanban.releases.v1."))) };
  });
}
async function original(page) { return page.evaluate(async () => {
  const project = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-project");
  return (await (await (await project.getDirectoryHandle("docs")).getFileHandle("01_smoke_tickets.md")).getFile()).text();
}); }
const fixture = `# PWA Smoke\n\n[Saved colleague link](/Users/colleague/product/docs/linked.md)\n\n## Status\n- 현재 진행률: 0 / 1 tickets\n\n## Ticket List\n\n### PWA-01. Offline smoke ticket\n\nStatus: TODO\nProgress: 0%\nRepository:\n\n- smoke-project\n\nPriority: P1\nType: Feature\nDepends on:\n\n- 없음\n\n목표:\n\n- 오프라인 저장\n\n현재 문제:\n\n- 없음\n\n구현 범위:\n\n- 테스트\n\n제외 범위:\n\n- 없음\n\n완료 기준:\n\n- [ ] 확인\n\n검증:\n\n- [ ] 확인\n\n사용자 지시:\n\n진행 메모:\n`;

async function openSavedLink(page, name) {
  await page.getByRole("button", { name: "마크다운", exact: true }).click();
  const sourceUrl = page.url();
  await page.getByRole("link", { name: "Saved colleague link", exact: true }).click();
  const reader = page.locator("section[aria-label]").filter({ has: page.locator("[data-linked-document]") });
  await reader.getByText("PERSISTED LINK TARGET", { exact: true }).waitFor();
  await reader.getByText(/읽기 전용/).waitFor();
  assert.match(new URL(page.url()).searchParams.get("linked"), /^ld_/);
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.screenshot({ path: resolve(output, `linked-document-${name}.png`) });
  await reader.getByRole("button", { name: "출발 문서로 돌아가기", exact: true }).click();
  await page.waitForURL(sourceUrl);
  await page.getByRole("button", { name: "보드", exact: true }).click();
}

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
  if (installWindow) {
    await assertThemeColor(installWindow, "--background", false);
    await installWindow.getByRole("button", { name: "다크 모드로 전환" }).click();
    await assertThemeColor(installWindow, "--background", true);
    await assertThemeColor(page, "--background", true);
    await installWindow.emulateMedia({ colorScheme: "light" });
    await installWindow.reload();
    await assertThemeColor(installWindow, "--background", true);
    await installWindow.screenshot({ path: resolve(output, "installed-dark-content.png") });
    await installWindow.getByRole("button", { name: "라이트 모드로 전환" }).click();
    await assertThemeColor(page, "--background", false);
    record("Installed PWA theme metadata follows explicit preference, reload and cross-window sync, not OS theme");
  }
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
    const linked = await docs.getFileHandle("linked.md", { create: true });
    const linkedWriter = await linked.createWritable(); await linkedWriter.write("# Linked document\n\nPERSISTED LINK TARGET\n"); await linkedWriter.close();
    window.showDirectoryPicker = async () => project;
  }, fixture);
  await page.getByRole("button", { name: "프로젝트 열기", exact: true }).click();
  await page.getByText("Offline smoke ticket", { exact: true }).waitFor();
  const projectUrl = page.url();
  await page.getByRole("button", { name: "다크 모드로 전환" }).click();
  await assertThemeColor(page, "--ak-surface", true);
  if (installWindow) await assertThemeColor(installWindow, "--background", true);
  await page.goto(origin + "/all");
  await assertThemeColor(page, "--background", true);
  await page.goto(projectUrl);
  await assertThemeColor(page, "--ak-surface", true);
  await page.getByRole("button", { name: "라이트 모드로 전환" }).click();
  await assertThemeColor(page, "--ak-surface", false);
  record("Project and All tickets routes use their own header surface without changing the saved theme");
  await page.goto(origin + "/intro#updates");
  const skillRelease = JSON.parse(await readFile(resolve(root, "scripts/skill-releases.json"), "utf8"))[0];
  const oldFiles = [];
  for (const file of skillRelease.files) oldFiles.push({ path: file.path, content: (await exec("git", ["show", `${skillRelease.source}:skills/implementation-ledger/${file.path}`], { cwd: root })).stdout });
  await page.evaluate(async (files) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-skill", { create: true });
    for (const file of files) {
      const parts = file.path.split("/"); const name = parts.pop(); let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable(); await writable.write(file.content); await writable.close();
    }
    window.showDirectoryPicker = async () => root;
  }, oldFiles);
  await page.getByRole("button", { name: "설치된 스킬 등록·관리", exact: true }).click();
  await page.getByRole("button", { name: "설치된 스킬 폴더 등록", exact: true }).click();
  await page.getByRole("heading", { name: "이 설치본에 적용할 업데이트가 있습니다" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "백업 후 스킬 업데이트" }).isDisabled(), true);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "백업 후 스킬 업데이트" }).click();
  await page.getByRole("heading", { name: "이 앱에 동봉된 스킬과 일치합니다" }).waitFor();
  await page.screenshot({ path: resolve(output, "skill-update-verified.png") });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "백업 내보내기" }).click();
  await (await downloadEvent).saveAs(resolve(output, "skill-backup.json"));
  await page.getByRole("button", { name: "백업 복원", exact: true }).click();
  await page.getByRole("button", { name: "확인 후 복원", exact: true }).click();
  await page.getByText("원본 스킬 파일을 복원하고 검증했습니다.", { exact: true }).waitFor();
  assert.equal(await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-skill");
    return (await (await root.getFileHandle("SKILL.md")).getFile()).text();
  }), oldFiles.find((file) => file.path === "SKILL.md").content);
  await page.keyboard.press("Escape");
  await page.goto(projectUrl);
  record("Opt-in registration, confirmation, official skill update, backup export and explicit restore (OPFS)");
  await page.evaluate(async () => {
    localStorage.setItem("alpha-kanban.locale", "ko");
    localStorage.setItem("alpha-kanban.allTickets.filters", JSON.stringify({ projectIds: [], hideDone: false, search: "" }));
    localStorage.setItem("pwa-smoke-setting", "preserve");
    const db = await new Promise((done) => { const request = indexedDB.open("alpha-kanban.browser.v1", 1); request.onsuccess = () => done(request.result); });
    const project = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-project");
    const docs = await project.getDirectoryHandle("docs");
    const linked = await docs.getFileHandle("linked.md");
    const scopeId = location.pathname.split("/")[2];
    const prefix = "/Users/colleague/product";
    await new Promise((done, reject) => {
      const tx = db.transaction("records", "readwrite"); const store = tx.objectStore("records");
      store.put({ id: "pending-smoke", fileId: "not-the-ticket", before: "original", intended: "uncertain" }, "recovery:pending-smoke");
      store.put({ id: "pwa-link-fixture", revision: "pwa-link-v1", scopeId, sourceLabel: "pwa-smoke-project", prefix, example: prefix + "/docs/linked.md", handle: project, label: "pwa-smoke-project", remotes: [], method: "manual" }, `link-mapping:v1:map:${encodeURIComponent(scopeId)}:${encodeURIComponent(prefix)}`);
      store.put({ id: "ld_pwa-fixture", handle: linked }, "link-mapping:v1:document:linked%3Apwa-link-fixture:docs%2Flinked.md");
      tx.oncomplete = done; tx.onerror = () => reject(tx.error);
    }); db.close();
    const cache = await caches.open("unrelated-app-cache"); await cache.put("/unrelated", new Response("kept"));
    await navigator.serviceWorker.register("/other/sw.js", { scope: "/other/" });
  });
  // Persist the page identity through the real navigation flow before comparing updates.
  await openSavedLink(page, "before-update");
  let before = await snapshot(page);
  assert(before.records.some(([key]) => key === "link-mapping:v1:page:ld_pwa-fixture"));
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
  const downloadPage = await context.newPage();
  await downloadPage.goto(origin + "/intro");
  assert.equal((await workerInfo(downloadPage)).buildId, versions.a.release.buildId);
  await context.setOffline(true); networkUnavailable = true;
  await downloadSkill(downloadPage, versions.a, "waiting-update-offline");
  networkUnavailable = false; await context.setOffline(false);
  await downloadPage.close();
  record("Running app downloads its complete, hash-matching skill ZIP offline while another release waits");
  await context.setOffline(true); networkUnavailable = true;
  await page.getByRole("button", { name: "업데이트 적용", exact: true }).click();
  await page.getByRole("heading", { name: "업데이트 내역", exact: true }).waitFor();
  await page.getByText("적용 대상 B의 변경 내용", { exact: true }).waitFor();
  await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await page.getByText("AI에서 이 스킬을 쓰는 작업과 다른 Alpha Kanban 앱의 스킬 변경을 마친 뒤 적용하세요. 검증이 끝날 때까지 이 창을 열어두세요.", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "release-before-update.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, "release-combined-narrow.png") });
  const combinedBounds = await page.getByRole("dialog").boundingBox();
  assert(combinedBounds && combinedBounds.x >= 0 && combinedBounds.x + combinedBounds.width <= 390);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).click();
  await page.getByText(/다른 앱 창의 작성 중인 내용도/).waitFor();
  networkUnavailable = false; await context.setOffline(false);
  await until(async () => await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).isEnabled(), "blocked approval cancelled after session resumes");
  assert.deepEqual(await snapshot(page), before, "Blocked app update must not leave skill consent or change existing backups");
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
  await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).click();
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
  // Freeze an actual client after mounting. A navigation fallback can otherwise
  // replace the synthetic no-script response with a fully responsive app page.
  await unresponsive.goto(origin + "/");
  await unresponsive.getByRole("button", { name: "앱 설치 및 업데이트", exact: true }).waitFor();
  await unresponsiveCdp.send("Emulation.setScriptExecutionDisabled", { value: true });
  await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).click();
  await page.getByText(/다른 앱 창의 작성 중인 내용도/).waitFor();
  assert.equal((await workerInfo(page)).buildId, versions.a.release.buildId);
  await unresponsive.close();
  record("Unresponsive app client refuses activation instead of discarding work");
  await context.setOffline(true); networkUnavailable = true;
  await page.getByRole("button", { name: "백업 후 함께 업데이트", exact: true }).click();
  await until(async () => (await workerInfo(page))?.buildId === versions.b.release.buildId, "controlled activation");
  await until(async () => (await page.locator("body").getAttribute("inert")) === null && await page.getByRole("button", { name: "앱 설치 및 업데이트" }).count() === 1, "updated page mounted");
  await page.getByText("등록된 스킬을 백업하고 업데이트했습니다.", { exact: true }).waitFor();
  const afterCombined = await snapshot(page);
  assert.deepEqual(afterCombined.settings, before.settings);
  const newRows = afterCombined.records.filter(([key]) => !before.records.some(([oldKey]) => key === oldKey));
  assert.equal(newRows.length, 2);
  const approval = newRows.find(([key]) => key === "skill-update:app-update")?.[1];
  const backup = newRows.find(([key]) => key.startsWith("skill-update:recovery:"))?.[1];
  assert.equal(approval?.state, "applied"); assert.equal(approval?.buildId, versions.b.release.buildId);
  assert.equal(backup?.state, "applied"); assert.equal(backup?.id, approval?.recoveryId);
  assert.deepEqual(afterCombined.records.filter(([key]) => before.records.some(([oldKey]) => key === oldKey)), before.records);
  const installedFiles = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("pwa-smoke-skill");
    const files = [];
    async function walk(dir, prefix = "") {
      for await (const entry of dir.values()) {
        if (entry.kind === "directory") await walk(entry, prefix + entry.name + "/");
        else files.push({ path: prefix + entry.name, content: await (await entry.getFile()).text() });
      }
    }
    await walk(root); return files.sort((a, b) => a.path.localeCompare(b.path));
  });
  const approvedPayload = JSON.parse(await readFile(resolve(versions.b.dir, "downloads", `implementation-ledger-${versions.b.release.skillBundle}.json`), "utf8"));
  assert.deepEqual(installedFiles, approvedPayload.files.map(({ path, content }) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path)));
  await page.screenshot({ path: resolve(output, "release-combined-success.png") });
  networkUnavailable = false; await context.setOffline(false);
  before = afterCombined;
  record("One confirmation updates the app then backs up and updates its exact registered skill once across windows, fully offline; blocked activation leaves files and backups unchanged");
  assert.match(await appVersion(page), new RegExp(versions.b.release.buildId));
  assert.match(await appVersion(second), new RegExp(versions.b.release.buildId));
  if (installWindow) {
    assert.match(await appVersion(installWindow), new RegExp(versions.b.release.buildId));
    await installWindow.screenshot({ path: resolve(output, "installed-updated.png") });
    await installWindow.close();
    record("Installed standalone window participates in the coordinated update");
  }
  await closeMenu(page); await closeMenu(second);
  assert.equal(new URL(page.url()).pathname, new URL(projectUrl).pathname);
  assert.equal(await page.getByRole("heading", { name: "업데이트 내역", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("alpha-kanban.releases.v1.read.smoke-b")), "1");
  // Simulate an unread automatic update, without changing any real user's release state.
  await page.evaluate(() => localStorage.removeItem("alpha-kanban.releases.v1.read.smoke-b"));
  await page.goto(origin + "/all");
  assert.equal(await page.getByRole("heading", { name: "업데이트 내역", exact: true }).count(), 0);
  const windowCdp = await context.newCDPSession(page);
  const newWindow = context.waitForEvent("page");
  await windowCdp.send("Target.createTarget", { url: origin + "/all", newWindow: true });
  const selectorWindow = await newWindow;
  await selectorWindow.waitForLoadState();
  await Promise.all([page.goto(origin), selectorWindow.goto(origin)]);
  const releaseHeading = (target) => target.getByRole("heading", { name: "업데이트 내역", exact: true });
  await until(async () => await releaseHeading(page).count() + await releaseHeading(selectorWindow).count() === 1, "one automatic release modal across two selector windows");
  const readerWindow = await releaseHeading(page).count() ? page : selectorWindow;
  await readerWindow.getByText("적용 대상 B의 변경 내용", { exact: true }).waitFor();
  // Give the other window repeated chances to claim the lock while the first reads.
  await selectorWindow.bringToFront();
  await selectorWindow.waitForTimeout(2500);
  assert.equal(await releaseHeading(page).count() + await releaseHeading(selectorWindow).count(), 1);
  await readerWindow.bringToFront();
  await readerWindow.screenshot({ path: resolve(output, "release-after-update.png") });
  await readerWindow.keyboard.press("Escape");
  await until(async () => await releaseHeading(page).count() + await releaseHeading(selectorWindow).count() === 0, "read release stays closed in both selector windows");
  await selectorWindow.close(); await windowCdp.detach();
  record("Two separate project-selector windows show one automatic release modal and share its read state");
  await page.reload(); await page.getByRole("heading", { name: "프로젝트", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "업데이트 내역", exact: true }).count(), 0);
  await openMenu(page); await page.getByRole("button", { name: "업데이트 내역", exact: true }).click();
  await page.getByText("적용 대상 B의 변경 내용", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  for (const locale of ["ko", "en"]) {
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: locale === "ko" ? "한국어" : "English", exact: true }).click();
    for (const dark of [false, true]) {
      if (await page.evaluate(() => document.documentElement.classList.contains("dark")) !== dark) {
        await page.getByRole("button", { name: locale === "ko" ? dark ? "다크 모드로 전환" : "라이트 모드로 전환" : dark ? "Switch to dark mode" : "Switch to light mode", exact: true }).click();
      }
      for (const width of [1360, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const trigger = page.getByRole("button", { name: locale === "ko" ? "앱 설치 및 업데이트" : "App installation and updates", exact: true });
        await trigger.click();
        await page.getByRole("button", { name: locale === "ko" ? "업데이트 내역" : "Update history", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("heading", { name: locale === "ko" ? "업데이트 내역" : "Update history", exact: true }).waitFor();
        const box = await dialog.boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 901);
        assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
        assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true);
        await page.screenshot({ path: resolve(output, `release-${locale}-${dark ? "dark" : "light"}-${width}.png`) });
        await page.keyboard.press("Escape");
        assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      }
    }
  }
  if (authoredRelease.skill) {
    await page.getByRole("button", { name: "App installation and updates", exact: true }).click();
    await page.getByRole("button", { name: "Update history", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Skill updates", exact: true }).click();
    await page.getByRole("dialog").getByRole("heading", { name: "Skill updates", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.getByRole("dialog").locator('[aria-busy="false"]').waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("heading", { name: "Update history", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
    await page.keyboard.press("Escape");
    record("Release notes open skill management and return without stacked dialogs, losing language or theme");
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "한국어", exact: true }).click();
  if (before.settings["alpha-kanban.theme"] === "light") await page.getByRole("button", { name: "라이트 모드로 전환", exact: true }).click();
  record("Release history fits desktop and narrow viewports in Korean/English and light/dark with focus restored");
  await page.goto(projectUrl);
  record("Prepared release notes before apply, route preservation, selector-only once-per-release modal and manual replay");
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await original(page), savedBeforeUpdate);
  record("Two-window update, connection/document IDs, settings and recovery preservation");
  await openSavedLink(page, "after-update");
  assert.deepEqual(await snapshot(page), before);
  record("Saved colleague link and linked document identity survive the PWA update (OPFS)");

  await context.close(); networkUnavailable = true; context = await launch(true); page = context.pages()[0];
  if (installed) {
    const cdp = await context.newCDPSession(page);
    const opened = context.waitForEvent("page");
    await cdp.send("PWA.launch", { manifestId: origin + "/", url: origin + "/intro" });
    const window = await opened;
    await window.getByRole("heading", { name: "Alpha Kanban", exact: true }).waitFor();
    assert.equal(await window.evaluate(() => matchMedia("(display-mode: standalone)").matches), true);
    await downloadSkill(window, versions.b, "standalone-cold-offline");
    record("Installed PWA downloads the app-pinned skill ZIP after a fully offline Chrome restart");
    await window.close(); await cdp.detach();
    record("Installed app cold-launches offline after the Chrome process was closed");
  }
  await page.goto(origin + "/intro"); await page.getByRole("heading", { name: "Alpha Kanban", exact: true }).waitFor();
  await downloadSkill(page, versions.b, "updated-cold-offline");
  record("Updated app downloads the complete skill ZIP offline with matching archive and per-file hashes");
  await openMenu(page); await page.getByRole("button", { name: "업데이트 내역", exact: true }).click();
  await page.getByText("적용 대상 B의 변경 내용", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  record("Release history remains readable on an offline cold launch");
  await page.goto(origin + "/all"); await page.getByText("Offline smoke ticket", { exact: true }).waitFor();
  await page.goto(projectUrl);
  await openSavedLink(page, "cold-offline");
  assert.deepEqual(await snapshot(page), before);
  record("Saved colleague link reopens after a complete offline Chrome restart (OPFS)");
  await page.goto(projectUrl); await page.getByText("Offline smoke ticket", { exact: true }).click();
  await page.getByRole("textbox", { name: "수동 지시", exact: true }).fill("오프라인 지시 저장");
  await page.getByRole("button", { name: "문서에 추가", exact: true }).click();
  await until(async () => (await original(page)).includes("[수동지시] 오프라인 지시 저장"), "offline file write");
  const afterWrite = await original(page);
  await page.keyboard.press("Escape");
  await openMenu(page); await page.screenshot({ path: resolve(output, "offline-menu.png") }); await closeMenu(page);
  record("Chrome cold restart offline, previously unvisited routes and verified local write (OPFS)");
  networkUnavailable = false; await context.setOffline(false);
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
  assert.equal(await page.evaluate(() => localStorage.getItem("alpha-kanban.releases.v1.read.smoke-b")), "1");
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
