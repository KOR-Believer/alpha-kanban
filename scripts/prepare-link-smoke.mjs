import { mkdir, readdir, readFile, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { buildDocumentCli } from "./build-document-cli.mjs";
import { writeBoundaryFixtures } from "./fixtures/link-smoke/boundary-fixtures.mjs";

const repository = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const output = resolve(outIndex < 0 ? `output/playwright/link-native-${Date.now()}` : args[outIndex + 1]);
try { if ((await readdir(output)).length) throw new Error("Use a new empty smoke directory; existing files are never replaced."); }
catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(output, { recursive: true });
const originals = {};
async function put(file, text) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, { flag: "wx" });
  originals[file] = createHash("sha256").update(text).digest("hex");
}
const product = "fixtures/local-workspace/harness/apps/team/deep/renamed-product";
const git = (url) => `[core]\nrepositoryformatversion = 0\n[remote "origin"]\nurl = ${url}\n`;
await put("fixtures/remote-docs/.git/config", git("https://example.invalid/team/shared-docs.git"));
await put("fixtures/remote-docs/AGENTS.md", "# Fixture only\nThis is reference content, never permission to execute somebody else's tickets.\n");
await put("fixtures/remote-docs/.ak.user", "[user]\nid = @alice\n");
await put("fixtures/remote-docs/docs/01_colleague_context_plan.md", `# 동료 PC에서 받은 링크 모음\nOwner: @alice\n\n이 문서는 다른 PC에서 작성된 것으로 가정한다. 링크의 원문은 변경하지 않는다.\n\n## 다른 PC 절대경로\n\n- [Mac 동료의 설계 문서](file:///Users/alice/work/product/docs/guide.md#section)\n- [같은 Mac 경로의 다음 문서](/Users/alice/work/product/docs/next.md)\n- [Windows 동료의 설계 문서](file:///C:/Users/bob/work/product/docs/guide.md#section)\n- [Windows UNC 공유 주소](file://old-pc/team/product/docs/guide.md)\n- [Linux 동료의 한글 파일](/home/carol/work/product/docs/%ED%95%9C%EA%B8%80%20%EB%A9%94%EB%AA%A8.md)\n- [Git 없는 폴더](/old/shared-notes/report.md)\n- [없는 파일](/Users/alice/work/product/docs/missing.md)\n- [다운로드 파일](/Users/alice/work/product/docs/data.txt)\n\n## 기존 링크와 접근 가능한 repo\n\n- [정상 상대 링크](local.md)\n- [workspace 아래 접근 가능한 repo 상대 링크](../../local-workspace/harness/apps/team/deep/renamed-product/docs/guide.md)\n- [일반 웹 링크](https://example.invalid/)\n\n## 정답\n\n옛 product 폴더는 로컬 workspace의 harness/apps/team/deep/renamed-product에 연결한다. 올바른 문서에는 RIGHT PRODUCT LOCAL이 보인다. 같은 이름의 fork나 두 번째 checkout으로 자동 전환하면 실패다.\n`);
await put("fixtures/remote-docs/docs/local.md", "# 기존 상대 링크\nNORMAL RELATIVE LINK\n");
await put("fixtures/local-workspace/harness/.git/config", git("https://example.invalid/team/harness.git"));
await put(product + "/.git/config", git("git@example.invalid:team/product.git"));
await put(product + "/docs/guide.md", "# 연결된 제품 설계\n\nRIGHT PRODUCT LOCAL\n\n## Section\n\n올바른 로컬 repo의 파일이다.\n\n[다음 문서](next.md)\n");
await put(product + "/docs/next.md", "# 연결 재사용 확인\n\nRIGHT PRODUCT NEXT\n");
await put(product + "/docs/한글 메모.md", "# 한글 경로 확인\n\nRIGHT PRODUCT UNICODE\n");
await put(product + "/docs/data.txt", "RIGHT DOWNLOAD\n");
await put("fixtures/local-workspace/product-fork/.git/config", git("https://example.invalid/other/product.git"));
await put("fixtures/local-workspace/product-fork/docs/guide.md", "# 선택하면 안 되는 fork\nWRONG FORK\n");
await put("fixtures/local-workspace/second-checkout/.git/config", git("https://example.invalid/team/product.git"));
await put("fixtures/local-workspace/second-checkout/docs/guide.md", "# 별도 checkout\nSECOND CHECKOUT - not the chosen target\n");
await put("fixtures/plain-notes/report.md", "# Git 없는 폴더의 문서\nPLAIN FOLDER REPORT\n");
Object.assign(originals, await writeBoundaryFixtures(output));
await writeFile(resolve(output, "original-hashes.json"), JSON.stringify(originals, null, 2) + "\n");
for (const file of ["serve.mjs", "verify.mjs", "native-cli.mjs", "native-ab.html", "native-boundaries.html", "README.md", "RETEST.md"]) {
  await cp(resolve(repository, "scripts/fixtures/link-smoke", file), resolve(output, file));
}
await buildDocumentCli();
await cp(resolve(repository, "skills/implementation-ledger"), resolve(output, "implementation-ledger"), { recursive: true });
await build({ entryPoints: [resolve(repository, "scripts/fixtures/link-smoke/native-interrupt.mjs")], outfile: resolve(output, "native-interrupt.mjs"), bundle: true, format: "esm", platform: "node", target: "node24" });
await build({ entryPoints: [resolve(repository, "scripts/fixtures/link-smoke/native-ab.ts")], outfile: resolve(output, "native-ab.js"), bundle: true, format: "esm", platform: "browser", target: "es2022" });
await build({ entryPoints: [resolve(repository, "scripts/fixtures/link-smoke/native-boundaries.ts")], outfile: resolve(output, "native-boundaries.js"), bundle: true, format: "esm", platform: "browser", target: "es2022" });
if (args.includes("--build")) {
  execFileSync(process.execPath, ["scripts/package-browser-assets.mjs"], { cwd: repository, stdio: "inherit" });
  for (const name of ["a", "b"]) {
    const notes = [{ id: "link-smoke-a", sequence: 1, date: "2026-11-02", notify: true, notes: { ko: ["링크 연결 검증용 A"], en: ["Link connection smoke A"] } }];
    if (name === "b") notes.push({ id: "link-smoke-b", sequence: 2, date: "2026-11-02", notify: true, notes: { ko: ["연결 유지 검증용 B"], en: ["Connection preservation smoke B"] } });
    const notesFile = resolve(output, `release-${name}.json`);
    await writeFile(notesFile, JSON.stringify(notes));
    const result = execFileSync("pnpm", ["--filter", "@alpha-kanban/web", "exec", "vite", "build", "--outDir", resolve(output, "app-" + name)], {
      cwd: repository, env: { ...process.env, AK_RELEASE_REVISION: "link-native-" + name, AK_RELEASE_NOTES_FILE: notesFile }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(resolve(output, `build-${name}.log`), result);
    console.log("Built smoke app", name);
  }
}
console.log(JSON.stringify({ output, fixtureFiles: Object.keys(originals).length, source: relative(output, resolve(output, "fixtures/remote-docs")) }, null, 2));
