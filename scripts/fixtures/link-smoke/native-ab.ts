import { LinkMappings, type LinkedResource } from "../../../apps/web/src/browser/linkMappings";
import { IndexedDbStorage } from "../../../apps/web/src/browser/storage";

const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const status = document.getElementById("status")!;
const choices = document.getElementById("choices")!;
const results = document.getElementById("results")!;
const storage = new IndexedDbStorage("alpha-kanban.native-link-ab.v1");
const trials = ["A old-absolute", "A accessible-relative", "B old-absolute", "B accessible-relative"];
const rows: Record<string, unknown>[] = [];
let root: FileSystemDirectoryHandle;
let source: FileSystemDirectoryHandle;
let expected: FileSystemDirectoryHandle;
let grantMs = 0;
let index = 0;
let lastError: string | null = null;
async function directory(parent: FileSystemDirectoryHandle, path: string) {
  for (const part of path.split("/")) parent = await parent.getDirectoryHandle(part);
  return parent;
}
const round = (value: number) => +value.toFixed(2);
function report() {
  return { environment: "Chrome native File System Access handles and IndexedDB; one local sample, not a general benchmark", userAgent: navigator.userAgent,
    passed: index === trials.length && rows.every(row => row.passed), completedCases: index, plannedCases: trials.length, error: lastError,
    rootPickerIncludingUserMs: round(grantMs), timing: "firstMs excludes human selection wait; scanMs is included in firstMs", rows };
}
function fail(error: unknown) { lastError = String(error); status.textContent = lastError; results.textContent = JSON.stringify(report(), null, 2); }
button("root").onclick = async () => {
  try {
    const start = performance.now();
    root = await window.showDirectoryPicker({ mode: "read" });
    grantMs = performance.now() - start;
    source = await directory(root, "remote-docs");
    expected = await directory(root, "local-workspace/harness/apps/team/deep/renamed-product");
    await (await expected.getDirectoryHandle("docs")).getFileHandle("guide.md");
    lastError = null;
    button("root").disabled = true; button("start").disabled = false;
    status.textContent = "준비 완료: A old-absolute";
  } catch (error) { fail(error); }
};
button("start").onclick = async () => {
  button("start").disabled = true;
  const name = trials[index]; const mode = name[0]; const absolute = name.endsWith("old-absolute");
  const experiment = { namespace: crypto.randomUUID(), autoDiscover: mode === "B" };
  const roots = async () => [{ id: "fixture-root", name: root.name, handle: root }];
  const service = new LinkMappings(storage, roots, { experiment });
  const context = { scopeId: "source", label: "remote-docs", root: source, path: "docs/01_colleague_context_plan.md", documentId: "source" };
  const href = absolute ? "/Users/alice/work/product/docs/guide.md" : "../../local-workspace/harness/apps/team/deep/renamed-product/docs/guide.md";
  const prefix = absolute ? "/Users/alice/work/product" : "./../local-workspace/harness/apps/team/deep/renamed-product";
  let firstMs = 0; let scanMs = 0; let selectionWaitMs = 0; let firstChoices = 0;
  try {
    lastError = null;
    status.textContent = name + " 검사 중";
    const start = performance.now(); const attempt = await service.attempt(context, href);
    const scanStart = performance.now(); const scan = await service.scan({ preferred: context }); scanMs = performance.now() - scanStart;
    let opened = attempt.resource ?? await service.automatic(context, attempt, scan);
    firstMs = performance.now() - start;
    if (!opened) {
      firstChoices++;
      status.textContent = name + ": renamed-product를 선택하세요. fork와 second-checkout은 정답이 아닙니다.";
      const waiting = performance.now();
      const selected = await new Promise<{ handle: FileSystemDirectoryHandle; label: string; repo?: typeof scan.repos[number] }>((resolve, reject) => {
        const targets = mode === "A" ? [null] : scan.repos;
        for (const repo of targets) {
          const control = document.createElement("button"); control.textContent = repo ? repo.label : "정답 폴더 직접 선택";
          control.onclick = async () => { try {
            const handle = repo?.handle ?? await window.showDirectoryPicker({ mode: "read" });
            resolve({ handle, label: repo?.label ?? handle.name, ...(repo ? { repo } : {}) });
          } catch (error) { reject(error); } };
          choices.append(control);
        }
        if (!targets.length) reject(new Error("No candidates; incomplete discovery must not be counted as success."));
      });
      selectionWaitMs = performance.now() - waiting; choices.replaceChildren();
      const saveStart = performance.now(); opened = await service.save(context, attempt.location, prefix, selected); firstMs += performance.now() - saveStart;
    }
    const target = await (await expected.getDirectoryHandle("docs")).getFileHandle("guide.md");
    const right = async (value?: LinkedResource) => !!value && await value.handle.isSameEntry(target) && (await value.file.text()).includes("RIGHT PRODUCT LOCAL");
    const fresh = new LinkMappings(new IndexedDbStorage("alpha-kanban.native-link-ab.v1"), roots, { experiment });
    const reuseStart = performance.now(); const reuse = await fresh.attempt(context, href); const reuseMs = performance.now() - reuseStart;
    const correct = await right(opened) && await right(reuse.resource);
    rows.push({ name, passed: correct, wrong: correct ? 0 : 1, unresolved: reuse.resource ? 0 : 1, firstChoices, reuseChoices: 0,
      firstMs: round(firstMs), scanMs: round(scanMs), reuseMs: round(reuseMs), selectionWaitMs: round(selectionWaitMs), scannedDirectories: scan.visited, completeScan: scan.complete });
    index++; results.textContent = JSON.stringify(report(), null, 2);
    if (!correct) throw new Error("Wrong or unresolved target; stop and inspect the result.");
    status.textContent = index === trials.length ? "PASS 4/4 — 실제 폴더와 IndexedDB 재사용 검증 완료" : "PASS — 다음: " + trials[index];
    button("start").disabled = index === trials.length;
  } catch (error) { choices.replaceChildren(); fail(error); }
  button("download").disabled = false;
};
button("download").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "native-link-ab.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
