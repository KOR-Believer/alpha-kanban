import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Synthetic files only. Re-running does not overwrite an existing smoke fixture.
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../output/playwright/project-search");
const folder = resolve(out, "fixture-v2");
const manifest = resolve(out, "fixture-v2-manifest.json");
try { await access(manifest); console.log(JSON.stringify({ folder, existing: true })); process.exit(0); } catch {}

function ticket(id, title, note) {
  return `### ${id}. ${title}\n\nStatus: READY\n\nProgress: 25%\n\nRepository:\n\n- demo\n\nPriority: P1\n\nType: Feature\n\nDepends on:\n\n- 없음\n\n목표:\n\n- 검색과 읽기를 확인한다.\n\n현재 문제:\n\n- 많은 문서에서 필요한 작업을 찾는다.\n\n구현 범위:\n\n- 합성 예시만 사용한다.\n\n제외 범위:\n\n- 실제 문서 수정\n\n완료 기준:\n\n- [ ] 검색 결과를 확인한다.\n\n검증:\n\n- [ ] 원문을 보존한다.\n\n사용자 지시:\n\n진행 메모:\n\n${note ? `설계 세부 메모:\n\n- ${note}\n\n` : ""}`;
}
function document(title, count, prefix, special = false) {
  return `# ${title}\n\n## Status\n\n- 현재 진행률: \`0 / ${count} tickets\`\n\n## 확인·결정이 필요한 사항\n\n- 없음\n\n## Ticket List\n\n` +
    Array.from({ length: count }, (_, i) => ticket(`${prefix}-${String(i + 1).padStart(3, "0")}`, `검색 예시 ${i + 1}`, special && i >= count - 2 ? "청록색 등대에서 마지막 작업을 확인한다." : "")).join("") +
    "## 문서 공통 안내\n\n공통 안내 전용 문장은 티켓에 배정하지 않는다.\n";
}
const sources = new Map([
  ["docs/@alice/01_lighthouse_tickets.md", document("등대 작업", 500, "LIGHT", true)],
  ["docs/@alice/01_lighthouse_plan.md", "# 등대 계획\n\n## 목표\n\n청록색 등대를 이용한 문서 탐색을 검토한다.\n\n## 확인·결정이 필요한 사항\n\n- 없음\n"],
  ["docs/@alice/01_lighthouse_inventory.md", "# 등대 조사\n\n## 조사 결과\n\n청록색 등대는 문서·티켓에서 함께 검색한다.\n\n## 확인·결정이 필요한 사항\n\n- 없음\n"],
  ["notes/README.md", "# 일반 Markdown\n\n일반 문서에도 청록색 등대가 기록되어 있다.\n\n| 이름 | 값 |\n| --- | --- |\n| 상태 | 읽기 전용 검색 |\n"]
]);
for (let i = 0; i < 500; i++) sources.set(`docs/@${i % 2 ? "bob" : "alice"}/area-${i % 10}/${String(i + 2).padStart(4, "0")}_example-${i + 1}_tickets.md`, document(`작업 묶음 ${i + 1}`, 20, "TASK"));
for (const [path, content] of sources) {
  await mkdir(dirname(resolve(folder, path)), { recursive: true });
  await writeFile(resolve(folder, path), content);
}
await writeFile(manifest, JSON.stringify([...sources].map(([path, content]) => ({ path, sha256: createHash("sha256").update(content).digest("hex") })), null, 2));
console.log(JSON.stringify({ folder, documents: sources.size, tickets: 10500, bytes: [...sources.values()].reduce((n, text) => n + Buffer.byteLength(text), 0) }));
