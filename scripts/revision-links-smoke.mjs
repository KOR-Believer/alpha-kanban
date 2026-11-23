import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, sep, extname, basename } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { revisionFixture, git } from "../docs/assets/alpha_kanban_git_revision_links/fixtures/repositories.mjs";
import { removeSmokeScratch } from "./lib/smoke-artifacts.mjs";
import { formatRevisionLink } from "../packages/shared/src/revisionLinks.mjs";

const dist = resolve("apps/web/dist-browser");
const placement = JSON.parse(execFileSync(process.execPath, ["skills/implementation-ledger/scripts/document-context.mjs", "artifacts",
  "--cwd", ".", "--target", "docs/37_alpha_kanban_git_revision_links_tickets.md"], { encoding: "utf8" }));
const scratch = resolve(placement.artifacts.output);
await mkdir(scratch, { recursive: true });
const run = await mkdtemp(join(scratch, "browser-"));
const f = revisionFixture(join(run, "repositories"), { pack: true, large: true });
const report = { checks: [], browser: "", packBytes: 0, firstReadMs: 0 };
async function check(name, body) {
  try { await body(); report.checks.push(name); console.log("OK", name); }
  catch (e) { throw new Error(name, { cause: e }); }
}
const packDir = join(f.policy, ".git/objects/pack");
report.packBytes = (await stat(join(packDir, (await readdir(packDir)).find(x => x.endsWith(".pack"))))).size;
const capture = repo => [git(repo, "rev-parse", "HEAD"), git(repo, "status", "--porcelain"), git(repo, "ls-files", "-s")];
// The right side must be the bytes on disk even when HEAD has different contents.
const workingRule = "export const windowDays = 11; // saved locally\nexport const exception = 'damaged seal';\n";
await writeFile(join(f.code, "src/rule.ts"), workingRule);
const before = [capture(f.policy), capture(f.code)];
const policy = (await readFile("apps/web/public-browser/_headers", "utf8")).match(/Content-Security-Policy: (.+)/)[1];
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".woff2":"font/woff2", ".webmanifest":"application/manifest+json", ".png":"image/png" };
const server = createServer(async (req, res) => {
  let path = new URL(req.url, "http://local").pathname;
  if (path === "/__smoke_folder_grants") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end("<!doctype html><meta charset=utf-8><title>Synthetic folder grants</title><body>Drop a fixture folder here.</body>");
    return;
  }
  if (path === "/" || path.startsWith("/w/") || path === "/all") path = "/index.html";
  const file = resolve(dist, "." + path);
  if (!file.startsWith(dist + sep)) { res.writeHead(400).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Content-Security-Policy": policy, "Cache-Control":"no-cache" }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = "http://127.0.0.1:" + server.address().port;
let context, page, evidenceUrl, finished = false;
try {
  context = await chromium.launchPersistentContext(join(run, "profile"), { channel: process.env.AK_TEST_BROWSER || "chrome", headless: true });
  context.setDefaultTimeout(8500);
  await context.addInitScript(() => {
    localStorage.setItem("alpha-kanban.locale", "en");
    window.longTasks = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.longTasks.push(Math.round(entry.duration)); }).observe({type:"longtask", buffered:true});
  });
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin + "/__smoke_folder_grants");
  report.browser = await page.evaluate(() => navigator.userAgent);
  const session = await context.newCDPSession(page);
  // CDP supplies genuine native directory drops. Only the isolated fixture handles
  // are seeded in the app's registry; the reader itself uses the shipped UI and worker.
  await page.evaluate(() => {
    window.addEventListener("dragover", event => event.preventDefault());
    window.addEventListener("drop", event => {
      event.preventDefault();
      const promised = event.dataTransfer.items[0].getAsFileSystemHandle();
      window.seed = promised.then(handle => new Promise((resolve, reject) => {
        const request = indexedDB.open("alpha-kanban.browser.v1", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("records");
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction("records", "readwrite");
          const c = { id: "c_" + handle.name, name: handle.name, kind: window.grantKind, handle };
          tx.objectStore("records").put(c, "connection:" + c.id);
          tx.oncomplete = () => { db.close(); resolve({ name:handle.name, kind:handle.kind }); }; tx.onabort = () => reject(tx.error);
        }; request.onerror = () => reject(request.error);
      }));
    });
  });
  const grantingPage = page;
  async function grantDirectory(dir, kind = "project") {
    await grantingPage.evaluate(value => { window.seed = undefined; window.grantKind = value; }, kind);
    for (const type of ["dragEnter", "dragOver", "drop"]) await session.send("Input.dispatchDragEvent", { type, x: 10, y: 100, data: { items: [], files: [dir], dragOperationsMask: 1 } });
    await grantingPage.waitForFunction(() => !!window.seed);
    assert.deepEqual(await grantingPage.evaluate(() => window.seed), { name:basename(dir), kind:"directory" });
  }
  for (const dir of [f.policy, f.code]) await grantDirectory(dir);
  // Keep the granting document alive; Chrome may release a transient native
  // drop grant when the last document using it closes.
  page = await context.newPage();
  const customUrl = (target, web = false) => origin + "/#" + new URLSearchParams({ revision: formatRevisionLink(target), ...(web && { web: "1" }) });
  const text = value => page.getByText(value, { exact: true }).last().waitFor();
  const link = value => page.getByRole("link", { name: value, exact: true }).last();
  async function readerInsets() {
    return page.locator(".ak-document-reader-viewport:visible").evaluate(node => {
      const style = getComputedStyle(node);
      const sidebar = node.querySelector("aside.ak-panel");
      const outer = node.getBoundingClientRect(), card = sidebar.getBoundingClientRect();
      const article = node.querySelector("article.ak-panel").getBoundingClientRect();
      return { padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        leftInset: Math.round(card.left - outer.left + node.scrollLeft), rightInset: Math.round(outer.right - article.right - node.scrollLeft),
        topInset: Math.round(card.top - outer.top + node.scrollTop) };
    });
  }
  async function readerScroll() {
    return page.locator(".ak-document-reader-viewport:visible").evaluate(node => {
      const article = node.querySelector("article.ak-panel");
      const body = article.querySelector(".ak-markdown").closest(".ak-scroll-area");
      const sample = document.createElement("p");
      sample.textContent = "A long policy clause for checking document scrolling. ".repeat(1200);
      const originalTop = node.scrollTop, originalBodyTop = body.scrollTop;
      body.querySelector(".ak-markdown").append(sample);
      try {
        node.scrollTop = 60; body.scrollTop = 60;
        return { outerScrolls: node.scrollTop > 0, bodyScrolls: body.scrollTop > 0,
          gutter: node.offsetWidth - node.clientWidth, gutterPolicy: getComputedStyle(node).scrollbarGutter,
          bodyGutterPolicy: getComputedStyle(body).scrollbarGutter, outlineGutterPolicy: getComputedStyle(node.querySelector("aside .ak-scroll-area")).scrollbarGutter };
      } finally { sample.remove(); body.scrollTop = originalBodyTop; node.scrollTop = originalTop; }
    });
  }
  await check("native packed repository shows the cited clause and external original", async () => {
    const start = performance.now();
    await page.goto(customUrl(f.citation.target, true));
    await text("Seven days after approval.");
    report.firstReadMs = Math.round(performance.now() - start);
    report.mainThreadTasksOver50ms = await page.evaluate(() => window.longTasks);
    assert.equal(await link("Web original").getAttribute("href"), f.citation.web);
    await page.getByRole("heading", { name: "Deadline", exact: true }).waitFor();
  });
  await check("relative documents, historic image, headings and explicit other repository", async () => {
    await link("Details").click(); await text("A damaged seal is exempt on day seven.");
    const img = page.getByRole("img", { name: "Seal" });
    await img.waitFor();
    const pixels = await img.evaluate(async (el, bytes) => {
      await el.decode(); const expected = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type: "image/gif"}));
      const ctx = document.createElement("canvas").getContext("2d");
      function pixel(image) { ctx.drawImage(image, 0, 0); return [...ctx.getImageData(0, 0, 1, 1).data]; }
      const pixels = [pixel(el), pixel(expected)]; expected.close(); return pixels;
    }, [...f.image]);
    assert.deepEqual(pixels[0], pixels[1]);
    await link("This clause").click(); await text("A damaged seal is exempt on day seven.");
    await link("Return to clause").click(); await text("Seven days after approval.");
    assert.equal(await page.getByRole("link", { name: "Source rule", exact: true }).count(), 1);
    assert.equal(await page.locator(".ak-markdown").getByRole("link", { name: "Web original", exact: true }).count(), 0);
    await link("Source rule").click(); await page.locator(".ak-source-line[data-cited]").first().waitFor();
    assert.equal(await page.locator(".ak-source-line[data-cited]").count(), 2);
    assert.match(await page.locator(".ak-source-scroll").innerText(), /damaged seal/);
  });
  await check("cited source lines keep the gutter visible and code readable in both channel palettes and themes", async () => {
    report.citedLineColors = await page.locator(".ak-source-reader").evaluate(reader => {
      // Let the browser convert the theme's OKLCH and mixed colors into sRGB.
      const pixel = document.createElement("canvas").getContext("2d", {willReadFrequently:true});
      function luminance(color) {
        pixel.fillStyle = color; pixel.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(pixel.getImageData(0, 0, 1, 1).data, channel => {
          const c = channel / 255;
          return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        });
        return .2126 * r + .7152 * g + .0722 * b;
      }
      function contrast(a, b) { return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
      const root = document.documentElement, originalChannel = root.getAttribute("data-release-channel"), wasDark = root.classList.contains("dark");
      const row = reader.querySelector("[data-cited]"), gutter = row.querySelector(".ak-source-line-number");
      const glyphs = reader.querySelectorAll("[data-cited] code, [data-cited] code span, [data-cited] .ak-source-line-number");
      const samples = [];
      try {
        for (const channel of ["stable", "canary"]) for (const theme of ["light", "dark"]) {
          root.dataset.releaseChannel = channel; root.classList.toggle("dark", theme === "dark");
          const rowLuma = luminance(getComputedStyle(row).backgroundColor), rail = getComputedStyle(gutter);
          const glyphContrast = Math.min(...Array.from(glyphs, node => contrast(rowLuma, luminance(getComputedStyle(node).color))));
          samples.push({channel, theme, glyphContrast, markerWidth:parseFloat(rail.borderInlineStartWidth),
            markerContrast:contrast(rowLuma, luminance(rail.borderInlineStartColor)),
            rowContrast:contrast(rowLuma, luminance(getComputedStyle(reader).backgroundColor))});
        }
      } finally {
        if (originalChannel === null) root.removeAttribute("data-release-channel"); else root.dataset.releaseChannel = originalChannel;
        root.classList.toggle("dark", wasDark);
      }
      return samples;
    });
    for (const colors of report.citedLineColors) {
      const label = JSON.stringify(colors);
      assert.ok(colors.glyphContrast >= 4.5, label);
      assert.ok(colors.markerWidth > 0 && colors.markerContrast >= 3, label);
      assert.ok(colors.rowContrast > 1 && colors.rowContrast < 1.5, label);
    }
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    try {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      const lastLine = await page.locator(".ak-source-line").last().boundingBox();
      await page.screenshot({path:join(run, "cited-lines-dark.png"), animations:"disabled", clip:{
        x:0, y:0, width:page.viewportSize().width, height:Math.ceil(lastLine.y + lastLine.height + 12),
      }});
    } finally { await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), wasDark); }
  });
  await check("explicit current content, deleted paths and browser history", async () => {
    await page.goBack(); await text("Seven days after approval.");
    await link("View current file").click(); await text("Ten days after approval.");
    await page.goBack(); await text("Seven days after approval.");
    await link("Removed").click(); await page.locator(".ak-markdown h1").filter({hasText:"Archived clause"}).waitFor();
    await link("View current file").click(); await text("The file is missing at this location. Check the remaining path or choose another folder.");
    await page.goBack(); await page.goBack(); await link("Current only").click(); await text("This file is missing from the cited commit.");
  });
  await check("compare the citation with saved working text and keep comparison in browser history", async () => {
    const policyUrl = customUrl(f.citation.target, true);
    await page.goto(policyUrl); await text("Seven days after approval.");
    assert.equal(await page.locator("[data-revision-comparison]").count(), 0);
    await link("Compare with current").click();
    const diff = page.locator("[data-revision-comparison]");
    await diff.locator("[data-side=before]").getByText("Seven days after approval.", { exact: true }).waitFor();
    await diff.locator("[data-side=after]").getByText("Ten days after approval.", { exact: true }).waitFor();
    assert.match(page.url(), /view=compare/);
    await page.reload(); await diff.locator("[data-change=added]").first().waitFor();
    await page.screenshot({ path: join(run, "revision-compare.png") });
    const beforeCell = diff.locator('[data-change="removed"]').first(), afterCell = diff.locator('[data-change="added"]').first();
    const wide = await Promise.all([beforeCell.boundingBox(), afterCell.boundingBox()]);
    assert.equal(wide[0].y, wide[1].y); assert.ok(wide[0].x < wide[1].x);
    await page.setViewportSize({width:375, height:740});
    await page.evaluate(() => localStorage.setItem("alpha-kanban.theme", "dark"));
    await page.reload(); await afterCell.waitFor();
    await diff.locator(".ak-diff-head").getByText("Current working file", {exact:true}).waitFor();
    const narrow = await Promise.all([beforeCell.boundingBox(), afterCell.boundingBox()]);
    assert.equal(narrow[0].x, narrow[1].x); assert.ok(narrow[0].y < narrow[1].y);
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains("dark") && document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => localStorage.removeItem("alpha-kanban.theme"));
    await page.setViewportSize({width:1280, height:720});
    await page.goBack(); await text("Seven days after approval."); assert.equal(page.url(), policyUrl);
    await page.goto(customUrl(f.explicit.target)); await link("Compare with current").click();
    await diff.locator("[data-side=before]").getByText("export const windowDays = 7;", {exact:true}).waitFor();
    await diff.locator("[data-side=after]").getByText(workingRule.split("\n")[0], {exact:true}).waitFor();
    assert.equal(git(f.code, "show", "HEAD:src/rule.ts").includes("11;"), false);
    await page.goto(customUrl({ ...f.citation.target, path:"policies/gone.md", anchor:undefined }));
    await link("Compare with current").click(); await text("The current file is missing at the cited path.");
    await page.locator(".ak-revision-side .ak-source-scroll").getByText("# Archived clause", {exact:true}).waitFor();
    await link("View cited revision").click(); await page.getByRole("heading", {name:"Archived clause", exact:true}).last().waitFor();
  });
  await check("read the cited ticket board, smoke sheet and frozen run before comparing Markdown", async () => {
    const open = path => page.goto(customUrl({ ...f.citation.target, path, anchor:undefined }));
    await open("policies/01_refund_tickets.md");
    const card = page.locator('[data-ticket-key="RF-01"]');
    await card.waitFor(); assert.equal(await card.getAttribute("draggable"), "false");
    assert.match(await card.locator("xpath=ancestor::section[1]").getAttribute("aria-label"), /ready/i);
    await card.getByRole("link").click();
    await page.locator(".ak-markdown h3").filter({hasText:"Check the refund window"}).waitFor();
    await page.goBack(); await card.waitFor(); await link("Compare with current").click();
    await text("Status: READY"); await text("Status: DONE");
    await open("policies/02_refund_smoke.md"); await page.getByRole("region", {name:"Smoke definition sheet"}).waitFor();
    await text("Open the refund clause"); await link("Compare with current").click();
    await text("Summary: Read the seven-day clause."); await text("Summary: Read the ten-day clause.");
    await open("policies/03_refund_smoke_run.md"); await page.getByRole("region", {name:"Smoke run sheet"}).waitFor();
    await text("All cases passed"); assert.equal(await page.getByRole("button", {name:"Close run"}).count(), 0);
    await link("Compare with current").click(); await text("Result: PASS"); await text("Result: FAIL");
  });
  await check("show both image blobs, and keep the working image visible when the proven cited blob is too large", async () => {
    async function openImage(name) {
      await page.goto(customUrl({ ...f.citation.target, path:"policies/more/" + name, anchor:undefined }));
      await link("Compare with current").click();
    }
    await openImage("seal.gif");
    const pictures = page.locator(".ak-revision-image img");
    await pictures.nth(1).waitFor();
    const pixels = await pictures.evaluateAll(async imgs => {
      const ctx = document.createElement("canvas").getContext("2d");
      return Promise.all(imgs.map(async img => {
        await img.decode(); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(0, 0, 1, 1).data];
      }));
    });
    assert.equal(pixels.length, 2); assert.notDeepEqual(pixels[0], pixels[1]);
    await openImage("large.gif"); await text("The cited file is too large to preview.");
    await pictures.waitFor(); assert.match(await pictures.getAttribute("alt"), /Current working file/);
    await link("View cited revision").click(); await text("The cited file is too large to preview.");
  });
  await check("saved project Markdown collapses inline and reference pairs; new tab and refresh keep revision", async () => {
    await link("Workspaces").click();
    const project = await page.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open("alpha-kanban.browser.v1"); r.onsuccess = () => {
        const db = r.result, c = db.transaction("records").objectStore("records").openCursor();
        c.onsuccess = () => { const cur = c.result; if (!cur || (String(cur.key).startsWith("project:") && cur.value.label === "evidence")) { db.close(); resolve(cur?.value.id); } else cur.continue(); };
      };
    }));
    if (project) await page.goto(origin + "/w/" + project);
    else await page.getByText("evidence", { exact: true }).first().click();
    await page.getByRole("link", {name:"Refund basis", exact:true}).last().waitFor();
    evidenceUrl = page.url();
    const main = page.locator(".ak-markdown");
    assert.equal(await main.getByRole("link", {name:"Web original", exact:true}).count(), 0);
    assert.equal(await main.getByRole("link", {name:"Normal link", exact:true}).getAttribute("href"), "https://example.com/");
    const pair = main.getByRole("link", {name:"Reference pair", exact:true});
    const popup = context.waitForEvent("page"); await pair.click({button:"middle"}); const next = await popup;
    await next.getByText("Seven days after approval.", { exact:true }).waitFor();
    await next.reload(); await next.getByText("Seven days after approval.", {exact:true}).waitFor(); await next.close();
    await pair.click(); await text("Seven days after approval."); await link("Back to source document").click(); await pair.waitFor();
  });
  await check("ordinary path links use the repository picker and review the replacement path before saving", async () => {
    const start = page.url(), length = await page.evaluate(() => history.length);
    await link("Old PC policy").click();
    const modal = page.getByRole("dialog", {name:"Connect local link", exact:true});
    await modal.getByRole("textbox", {name:"Search discovered repositories"}).fill("policy");
    await modal.getByRole("button", {name:/policy.*origin=/}).click();
    await modal.getByRole("button", {name:"Review selected folder"}).click();
    const review = page.getByRole("dialog", {name:"Review link connection", exact:true});
    await review.getByText("policies/refund.md", {exact:true}).waitFor();
    await review.getByRole("button", {name:"Cancel", exact:true}).click();
    await review.waitFor({state:"hidden"}); assert.equal(page.url(), start);
    assert.equal(await page.evaluate(() => history.length), length);
  });
  await check("connected Markdown keeps its source page and one citation", async () => {
    const source = await page.evaluate(async () => {
      const db = await new Promise(done => { const r = indexedDB.open("alpha-kanban.browser.v1", 1); r.onsuccess = () => done(r.result); });
      const record = await new Promise(done => { const r = db.transaction("records").objectStore("records").get("connection:c_evidence"); r.onsuccess = () => done(r.result); });
      const root = record.handle, path = "docs/01_decision_plan.md", id = "ld_revision-smoke";
      const file = await (await root.getDirectoryHandle("docs")).getFileHandle("01_decision_plan.md");
      await new Promise((done, reject) => {
        const tx = db.transaction("records", "readwrite"); tx.objectStore("records").put({id, handle:file, context:{root, path, label:root.name, scopeId:location.pathname.split("/")[2], documentId:id}}, "link-mapping:v1:page:" + id);
        tx.oncomplete = done; tx.onabort = () => reject(tx.error);
      });
      db.close(); const url = new URL(location.href); url.searchParams.set("linked", id); return url.href;
    });
    await page.goto(source); const body = page.locator("[data-linked-document] .ak-markdown");
    await body.waitFor();
    assert.equal((await readerInsets()).rightInset, 20);
    await body.getByRole("link", {name:"Refund basis"}).click(); await text("Seven days after approval.");
    await link("Back to source document").click(); await body.getByRole("link", {name:"Reference pair"}).click();
    await text("Seven days after approval.");
  });
  await check("switching a project ticket between Board and Markdown uses the visible view's gutter", async () => {
    await page.goto(origin + "/");
    await page.getByText("policy", {exact:true}).first().click();
    const card = page.locator('.ak-project-board-scroll [data-ticket-key="RF-01"]');
    const gutter = () => page.locator("[data-board-scroll]:visible").evaluate(node => getComputedStyle(node).scrollbarGutter);
    await card.waitFor(); assert.equal(await gutter(), "stable");
    await page.getByRole("button", {name:"Markdown", exact:true}).click();
    await page.locator(".ak-markdown h3").filter({hasText:"Check the refund window"}).waitFor();
    assert.equal(await gutter(), "auto");
    await page.getByRole("button", {name:"Board", exact:true}).click();
    await card.waitFor(); assert.equal(await gutter(), "stable");
  });
  await check("missing commit, missing anchor, changed repository and encoded filename", async () => {
    await page.goto(customUrl({...f.citation.target, commit:"c4".repeat(20)}));
    await text("This repository does not contain the cited commit.");
    await page.goto(customUrl({...f.citation.target, anchor:"absent"})); await text("The cited heading is missing from this file.");
    await page.goto(customUrl({...f.citation.target, path:"한 글/(#%).md", anchor:"same-1"}));
    await page.locator("h2#git-heading-same-1").waitFor();
    git(f.policy, "remote", "set-url", "origin", "https://github.com/example/different");
    try {
      await page.goto(customUrl(f.citation.target, true)); await text("This folder belongs to a different repository.");
      assert.equal(await link("Web original").getAttribute("href"), f.citation.web);
    } finally { git(f.policy, "remote", "set-url", "origin", "git@github.com:example/team-policy.git"); }
  });
  await check("loose and packed source bytes match native git show", async () => {
    const expected = execFileSync("git", ["-C", f.code, "show", f.codeOid + ":src/rule.ts"]);
    for (const packed of [false, true]) {
      if (packed) git(f.code, "gc", "--quiet");
      await page.goto(customUrl(f.explicit.target, true)); await page.reload();
      const download = page.waitForEvent("download"); await page.getByRole("button", {name:"Download file", exact:true}).click();
      assert.deepEqual(await readFile(await (await download).path()), expected);
    }
    const idxDir = join(f.code, ".git/objects/pack"), index = (await readdir(idxDir)).find(name => name.endsWith(".idx"));
    const packedObjects = git(f.code, "verify-pack", "-v", join(idxDir, index)).split("\n");
    const revision = [f.codeOid, git(f.code, "rev-parse", "HEAD")].find(oid => {
      const blob = git(f.code, "rev-parse", oid + ":src/audit.txt");
      return packedObjects.some(line => line.startsWith(blob + " ") && line.trim().split(/\s+/).length === 7);
    });
    assert.ok(revision, "fixture has a deltified blob");
    await page.goto(customUrl({...f.explicit.target, commit:revision, path:"src/audit.txt", anchor:"L175"}));
    const download = page.waitForEvent("download"); await page.getByRole("button", {name:"Download file", exact:true}).click();
    assert.deepEqual(await readFile(await (await download).path()), execFileSync("git", ["-C", f.code, "show", revision + ":src/audit.txt"]));
    report.deltaBytesVerified = true;
  });
  await check("installed bundle generates identical addresses and offline PWA reads the real pack", async () => {
    const manifest = await (await page.request.get(origin + "/manifest.webmanifest")).json();
    assert.deepEqual(manifest.protocol_handlers, [{ protocol: "web+akgit", url: "/#revision=%s" }]);
    const appSession = await context.newCDPSession(page);
    const { errors, url } = await appSession.send("Page.getAppManifest");
    assert.equal(url, origin + "/manifest.webmanifest"); assert.deepEqual(errors.filter(error => error.critical), []);
    await appSession.detach();
    const release = JSON.parse(await readFile(join(dist, "release.json")));
    const zip = unzipSync(await readFile(join(dist, "downloads/implementation-ledger-" + release.skillBundle + ".zip")));
    assert.ok(zip["implementation-ledger/references/revision-links.md"]);
    await mkdir(join(run, "extracted")); const cli = join(run, "extracted", "document-cli.mjs"); await writeFile(cli, zip["implementation-ledger/scripts/document-cli.mjs"]);
    const citation = JSON.parse(execFileSync(process.execPath, [cli, "revision-link", "--repo", f.policy, "--file", f.citation.target.path, "--rev", f.old, "--heading", "Deadline", "--label", "Refund basis", "--web-label", "Web original"]));
    assert.equal(citation.markdown, f.citation.markdown);
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state === "activated", undefined, {timeout:30000});
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true); await page.goto(customUrl(f.citation.target, true)); await page.reload();
    await text("Seven days after approval."); await link("Details").click(); await page.getByRole("img", {name:"Seal"}).waitFor();
    await context.setOffline(false);
  });
  await check("linked worktree prompts at the grant boundary, then opens inside the granted workspace", async () => {
    const family = join(run, "repositories"), wt = join(family, "feature");
    git(f.policy, "worktree", "add", "--quiet", "--detach", wt, f.old);
    await grantDirectory(wt);
    await grantingPage.evaluate(async hint => {
      const db = await new Promise(done => { const r = indexedDB.open("alpha-kanban.browser.v1"); r.onsuccess = () => done(r.result); });
      const c = await new Promise(done => { const r = db.transaction("records").objectStore("records").get("connection:c_feature"); r.onsuccess = () => done(r.result); });
      await new Promise((done, reject) => { const tx = db.transaction("records", "readwrite");
        tx.objectStore("records").put(c.handle, "git-revision:v1:%2F:" + encodeURIComponent(hint)); tx.oncomplete = done; tx.onabort = () => reject(tx.error); });
      db.close();
    }, f.citation.target.repo);
    await page.goto(customUrl(f.citation.target)); await text("Choose a checkout with accessible Git objects, such as the main repository.");
    await grantDirectory(family, "root"); await page.reload(); await text("Seven days after approval.");
  });
  await check("folder management shows saved Git choices and can forget and reconnect one project", async () => {
    // A second tree reaching the discovery depth limit leaves one known policy
    // candidate for the user to confirm. Keep the two fixture worktrees clean.
    await mkdir(join(run, "repositories", "deep", ...Array(22).fill("level")), { recursive: true });
    await page.goto(evidenceUrl);
    const folders = page.locator('[data-tour="local-folders"]');
    const manager = page.locator('[data-tour="link-connections"]');
    const projectRow = manager.locator(":scope > div").filter({ hasText:"evidence" }).filter({ hasText:f.citation.target.repo });
    const button = (name, node = page) => node.getByRole("button", {name, exact:true});
    const dialog = page.getByRole("dialog", {name:"Local folders", exact:true});
    const confirm = page.getByRole("dialog", {name:"Remove link connection", exact:true});
    await folders.click(); await projectRow.waitFor();
    assert.match(await projectRow.innerText(), /repositories\/policy/);
    await button("Remove link connection", projectRow).click();
    await button("Cancel", confirm).click(); await confirm.waitFor({state:"hidden"}); await projectRow.waitFor();
    await button("Remove link connection", projectRow).click();
    await button("Remove link connection", confirm).click(); await confirm.waitFor({state:"hidden"});
    await projectRow.waitFor({state:"detached"});
    await manager.getByText(/repositories\/feature$/).waitFor();
    await button("Close", dialog).first().click(); await dialog.waitFor({state:"hidden"});
    const source = page.url(), historyLength = await page.evaluate(() => history.length);
    const viewSizes = [1280, 850];
    const ordinary = [], scrolling = [];
    for (const width of viewSizes) {
      await page.setViewportSize({width, height:800}); ordinary.push(await readerInsets());
      scrolling.push({width,...await readerScroll()});
    }
    report.readerScrolling = scrolling;
    assert.deepEqual(scrolling.map(s => [s.outerScrolls, s.bodyScrolls]), [[false, true], [true, true]]);
    assert.deepEqual(scrolling.map(s => s.gutterPolicy), ["auto", "stable"]);
    assert.equal(scrolling[0].gutter, 0);
    assert.equal(ordinary[0].leftInset, 20); assert.equal(ordinary[0].rightInset, 20);
    for (const s of scrolling) {
      assert.equal(s.bodyGutterPolicy, "stable"); assert.equal(s.outlineGutterPolicy, "stable");
    }
    await page.setViewportSize({width:viewSizes[0], height:800});
    await link("Refund basis").click();
    const choose = page.getByRole("dialog", {name:"Choose repository folder", exact:true});
    const filter = choose.getByRole("textbox", {name:"Search discovered repositories", exact:true});
    const candidate = choose.getByRole("button", {name:/^Use (?:.*\/)?policy$/});
    await candidate.waitFor();
    assert.equal(page.url(), source); assert.equal(await page.evaluate(() => history.length), historyLength);
    assert.ok(await page.locator('[data-board-scroll] .ak-markdown:visible').count());
    await filter.fill("__absent__"); await candidate.waitFor({state:"hidden"});
    await filter.fill("policy"); await candidate.waitFor();
    await page.keyboard.press("Escape"); await choose.waitFor({state:"hidden"});
    await page.waitForFunction(() => document.activeElement?.textContent === "Refund basis");
    assert.equal(page.url(), source); assert.equal(await page.evaluate(() => history.length), historyLength);
    const direct = await context.newPage();
    try {
      const url = new URL(await link("Refund basis").getAttribute("href"), origin).href;
      await direct.goto(url); const picker = direct.getByRole("dialog", {name:"Choose repository folder", exact:true});
      await picker.getByRole("button", {name:/^Use (?:.*\/)?policy$/}).waitFor();
      await picker.getByRole("button", {name:"Cancel", exact:true}).click();
      await picker.waitFor({state:"hidden"}); assert.equal(direct.url(), url);
    } finally { await direct.close(); }
    await link("Refund basis").click(); await candidate.click(); await text("Seven days after approval.");
    assert.equal(await page.evaluate(() => history.length), historyLength + 1);
    const revisionUrl = page.url(), insets = [];
    for (const [i, width] of viewSizes.entries()) {
      await page.setViewportSize({width, height:800});
      const measured = await readerInsets(); assert.deepEqual(measured, ordinary[i]);
      assert.deepEqual(measured.padding, Array(4).fill("20px")); insets.push({width,...measured});
    }
    report.readerInsets = insets;
    await page.setViewportSize({width:viewSizes[0], height:800});
    await button("Change repository folder").click(); await candidate.waitFor();
    assert.equal(page.url(), revisionUrl); assert.ok(await page.locator("[data-linked-document] .ak-markdown:visible").count());
    await button("Cancel", choose).click(); await choose.waitFor({state:"hidden"});
    await page.goBack(); await link("Refund basis").waitFor(); assert.equal(page.url(), source);
    await page.goForward(); await text("Seven days after approval."); assert.equal(page.url(), revisionUrl);
    await page.reload(); await text("Seven days after approval.");
    await folders.click(); await projectRow.waitFor();
    assert.equal(await projectRow.count(), 1);
    assert.match(await projectRow.innerText(), /repositories\/policy/);
    await button("Close", dialog).first().click(); await dialog.waitFor({state:"hidden"});
  });
  await check("source workspace opens its unique citation; large searches stream early and late clones and can be stopped", async () => {
    const workspace = join(run, "batch-workspace");
    for (const sourceName of ["batch-source-a", "batch-source-b"]) {
      const docs = join(workspace, sourceName, "docs");
      await mkdir(docs, {recursive:true});
      await writeFile(join(docs, "01_decision_plan.md"), f.record);
    }
    function clonePolicy(dir) {
      git(f.policy, "clone", "--quiet", "--local", f.policy, dir);
      git(dir, "remote", "set-url", "origin", "git@github.com:example/team-policy.git");
    }
    clonePolicy(join(workspace, "early-clone"));
    await grantDirectory(workspace, "root");
    async function sourcePage(name) {
      await page.goto(origin + "/");
      await page.getByText(name, {exact:true}).first().click();
      await link("Refund basis").waitFor();
      return page.url();
    }
    await sourcePage("batch-source-a");
    await link("Refund basis").click();
    await text("Seven days after approval.");
    assert.match(await page.getByRole("button", {name:"Change repository folder"}).innerText(), /early-clone/);

    const wide = join(workspace, "wide"), tail = join(workspace, "tail", "level", "nested");
    await mkdir(wide); await mkdir(tail, {recursive:true});
    for (let i = 0; i < 3020; i += 40) {
      await Promise.all(Array.from({length: Math.min(40, 3020 - i)}, (_, j) => mkdir(join(wide, "folder-" + (i+j)))));
    }
    clonePolicy(join(tail, "late-clone"));
    const source = await sourcePage("batch-source-b");
    const picker = page.getByRole("dialog", {name:"Choose repository folder", exact:true});
    const early = picker.getByRole("button", {name:/^Use .*\/early-clone$/});
    const late = picker.getByRole("button", {name:/^Use .*\/late-clone$/});
    await link("Refund basis").click(); await early.waitFor();
    await picker.getByRole("button", {name:"Stop search", exact:true}).click();
    await picker.getByText("Search stopped. Folders found so far are listed below.").waitFor();
    assert.equal(await early.count(), 1); assert.equal(await late.count(), 0);
    assert.equal(page.url(), source);
    await picker.getByRole("button", {name:"Cancel", exact:true}).click();
    await link("Refund basis").click(); await early.waitFor();
    const start = performance.now();
    await late.waitFor({timeout:120000});
    report.batchSearch = { emptyFolders:3020, elapsedFromEarlyMs:Math.round(performance.now() - start) };
    assert.equal(await early.count(), 1); assert.equal(page.url(), source);
    await late.click(); await text("Seven days after approval.");
    assert.match(await page.getByRole("button", {name:"Change repository folder"}).innerText(), /late-clone/);
  });
  await grantingPage.close();
  await check("reopening the stored checkout after a browser restart rechecks native read permission", async () => {
    await context.close();
    context = await chromium.launchPersistentContext(join(run, "profile"), { channel:process.env.AK_TEST_BROWSER || "chrome", headless:true });
    page = context.pages()[0] ?? await context.newPage(); context.setDefaultTimeout(8500);
    await page.goto(customUrl(f.citation.target));
    const permission = await page.evaluate(async hint => {
      const db = await new Promise(done => { const r = indexedDB.open("alpha-kanban.browser.v1"); r.onsuccess = () => done(r.result); });
      const handle = await new Promise(done => { const r = db.transaction("records").objectStore("records").get("git-revision:v1:%2F:" + encodeURIComponent(hint)); r.onsuccess = () => done(r.result); });
      db.close(); return handle.queryPermission({mode:"read"});
    }, f.citation.target.repo);
    report.permissionAfterRestart = permission;
    await text(permission === "granted" ? "Seven days after approval." : "Allow read access to the Git repository.");
  });
  assert.deepEqual([capture(f.policy), capture(f.code)], before);
  assert.equal(await readFile(join(f.code, "src/rule.ts"), "utf8"), workingRule);
  finished = true;
} catch (error) {
  report.error = error.message + ": " + (error.cause?.message ?? "");
  if (page) report.lastPage = { url: page.url(), text: (await page.locator("body").innerText().catch(() => "")).slice(-2400) };
  throw error;
} finally {
  await context?.close(); await new Promise(done => server.close(done));
  await writeFile(join(run, "result.json"), JSON.stringify(report, null, 2));
  console.log(join(run, "result.json")); if (finished) await removeSmokeScratch(run, ["profile", "repositories", "extracted", "batch-workspace"], { root: scratch });
}
