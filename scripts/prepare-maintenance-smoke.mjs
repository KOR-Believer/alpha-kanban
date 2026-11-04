import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { markdownWorkerPlugins } from "../apps/web/worker.config.ts";

// Isolated, synthetic native-folder benchmark. Never opens a user's repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Usage: node scripts/prepare-maintenance-smoke.mjs before|after");
const out = resolve(root, "output/playwright/maintenance-performance");
const fixture = resolve(out, "fixture");
await mkdir(fixture, { recursive: true });
const board = "## Progress Board\n\n| Ticket | Status | Progress | Repository | Depends on |\n| --- | --- | --- | --- | --- |\n| OLD-99 | TODO | 0% | demo | - |\n\n";
const ticket = (n) => `### TASK-${String(n).padStart(2, "0")}. Example ${n}\n\nStatus: READY\nProgress: 25%\nRepository:\n- demo\nPriority: P1\nType: Feature\nDepends on:\n- 없음\n목표:\n- Keep the example readable.\n현재 문제:\n- Existing behavior needs a check.\n구현 범위:\n- A bounded example task.\n제외 범위:\n- 없음\n완료 기준:\n- [ ] Verify the result.\n검증:\n- [ ] Preserve original content.\n사용자 지시:\n- 2026-11-04: Synthetic smoke data.\n진행 메모:\n- 2026-11-04: [Reference](../../README.md#reference).\n\n`;
const body = "## Status\n\n- 현재 진행률: `0 / 20 tickets`\n\n## Ticket List\n\n" + Array.from({ length: 20 }, (_, i) => ticket(i + 1)).join("");
const sources = new Map([
  ["docs/@alice/00_cleanup_tickets.md", "# Cleanup example\nOwner: @previous\n\n" + board + body],
  ["docs/@alice/01_metadata_tickets.md", "# Metadata example\nOwner: @previous\n\n" + body],
  ["README.md", "# Reference\n\n[Working document](docs/@alice/00_cleanup_tickets.md#ticket-list)\n"]
]);
for (let i = 0; i < 500; i++) sources.set(`docs/@${i % 2 ? "bob" : "alice"}/area-${i % 10}/${String(i + 2).padStart(4, "0")}_example_tickets.md`, `# Example ${i}\n\n` + body);
let existing = false;
try { await access(resolve(out, "fixture-manifest.json")); existing = true; } catch {}
if (!existing) {
  for (const [path, content] of sources) {
    await mkdir(dirname(resolve(fixture, path)), { recursive: true });
    await writeFile(resolve(fixture, path), content);
  }
  await writeFile(resolve(out, "fixture-manifest.json"), JSON.stringify([...sources].map(([path, content]) => ({ path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") })), null, 2));
}
const entry = resolve(out, "entry.ts");
await writeFile(entry, `import { BrowserRepository, contentHash } from ${JSON.stringify(resolve(root, "apps/web/src/browser/repository.ts"))};
import { IndexedDbStorage } from ${JSON.stringify(resolve(root, "apps/web/src/browser/storage.ts"))};
const phase = ${JSON.stringify(phase)};
const storage = new IndexedDbStorage("maintenance-performance-smoke", "strict");
let repository, workspace, files, lastPlan;
const $ = (id) => document.getElementById(id);
const results = [];
let metrics;
for (const [proto, name, label] of [[FileSystemFileHandle.prototype,"getFile","getFile"], [FileSystemDirectoryHandle.prototype,"resolve","resolve"], [Blob.prototype,"arrayBuffer","bodyRead"]]) {
  const original = proto[name];
  proto[name] = function(...args) { if (metrics) { metrics[label]++; if(label === "bodyRead") metrics.bytesRead += this.size; } return original.apply(this,args); };
}
function show() { $("result").textContent = JSON.stringify({ phase, userAgent:navigator.userAgent, results }, null, 2); }
async function setup(handle) {
  repository = new BrowserRepository(storage);
  if (handle) await repository.connect(handle,"project");
  workspace = (await repository.workspaces()).workspaces.find(w => w.label === "fixture");
  if (!workspace) throw new Error("Select the generated fixture folder.");
  files = await repository.files(workspace.id, true);
  $("status").textContent = files.length + " documents ready. Phase: " + phase;
  $("run").disabled = false;
}
$("connect").onclick = async () => { try { await setup(await showDirectoryPicker({mode:"readwrite"})); } catch(e) { $("status").textContent = String(e); } };
$("resume").onclick = async () => { try { await setup(); } catch(e) { $("status").textContent = String(e); } };
async function measure(kind, sample) {
  const file = files.find(f => f.filename === (kind === "cleanup" ? "00_cleanup_tickets.md" : "01_metadata_tickets.md"));
  const generatedIds = { [file.relativePath]: kind === "cleanup" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222" };
  const tasks = [], gaps = []; let frame, last, active = true;
  const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e=>e.duration)));
  observer.observe({type:"longtask"});
  const tick = now => { if(last !== undefined) gaps.push(now-last); last=now; $("pulse").style.transform="translateX("+(now%1000)/4+"px)"; if(active) frame=requestAnimationFrame(tick); };
  frame=requestAnimationFrame(tick);
  await new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  metrics = {getFile:0,resolve:0,bodyRead:0,bytesRead:0};
  const start=performance.now();
  lastPlan = await repository.previewMigration(workspace.id,file.id,{assignId:true,cleanupLegacy:true,reconcileOwner:true},generatedIds);
  const elapsedMs=performance.now()-start, io=metrics; metrics=undefined;
  await new Promise(resolve => requestAnimationFrame(()=>setTimeout(resolve,60)));
  active=false; cancelAnimationFrame(frame); observer.disconnect();
  results.push({kind,sample,elapsedMs:Math.round(elapsedMs),maxFrameGapMs:Math.round(Math.max(0,...gaps)),longTasks:tasks.length,maxLongTaskMs:Math.round(Math.max(0,...tasks)),blockingMs:Math.round(tasks.reduce((n,d)=>n+Math.max(0,d-50),0)),...io,decision:lastPlan.preview.decision,previewHash:await contentHash(JSON.stringify(lastPlan.preview))});
  show();
}
$("run").onclick = async () => {
  $("run").disabled=true;
  try { for(const kind of ["cleanup","metadata"]) for(let sample=1;sample<=3;sample++) { $("status").textContent=phase+" "+kind+" "+sample+"/3"; await measure(kind,sample); } $("status").textContent="Complete"; $("apply").disabled=false; }
  catch(e) { $("status").textContent=String(e); }
  finally { metrics=undefined; $("run").disabled=false; }
};
$("apply").onclick = async () => { try { await repository.applyMigration(lastPlan); $("status").textContent="Applied selected metadata document"; } catch(e) { $("status").textContent=String(e); } };
$("download").onclick=()=>{const a=document.createElement("a"),url=URL.createObjectURL(new Blob([$("result").textContent],{type:"application/json"}));a.href=url;a.download="maintenance-"+phase+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
show();
`);
const alias = Object.fromEntries(["documents", "documentMetadata", "ticketMarkdown", "documentSettings", "documentMigration", "documentReferences", "documentPresentation"].map(name => ["@alpha-kanban/shared/" + name, resolve(root, "packages/shared/src/" + name + (["documents","documentMetadata","ticketMarkdown"].includes(name) ? ".ts" : ".mjs"))]));
await build({ configFile: false, root: resolve(root, "apps/web"), base: "./", logLevel: "warn", resolve: { alias }, worker: { plugins: markdownWorkerPlugins }, define: { __PWA_ENABLED__: "false" }, build: { outDir: resolve(out, phase), emptyOutDir: true, lib: { entry, formats: ["es"], fileName: () => "benchmark.mjs" } } });
await writeFile(resolve(out, phase, "index.html"), `<!doctype html><meta charset="utf-8"><title>Maintenance ${phase}</title><style>body{font:16px system-ui;padding:24px;background:#fafaf8;color:#222}button{font:inherit;margin:6px;padding:8px}pre{white-space:pre-wrap;font-size:13px}#pulse{width:20px;height:20px;border-radius:50%;background:#697b36}</style><h1>Maintenance ${phase}</h1><p>Synthetic native folder benchmark — 503 Markdown files. Preview is read-only.</p><button id="connect">Connect smoke folder</button><button id="resume">Use saved smoke connection</button><button id="run" disabled>Run 3 samples per scenario</button><button id="apply" disabled>Apply last preview to smoke file</button><button id="download">Download results</button><p id="status">Choose the generated fixture folder.</p><div id="pulse"></div><pre id="result"></pre><script type="module" src="./benchmark.mjs"></script>`);
console.log(JSON.stringify({ phase, folder: fixture, page: resolve(out, phase, "index.html"), documents: sources.size, bytes: [...sources.values()].reduce((n,s)=>n+Buffer.byteLength(s),0) }));
