#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "skills/implementation-ledger");
const destination = path.join(root, "apps/web/public-browser/downloads");
const files = {};
async function collect(directory, relative = "") {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? relative + "/" + entry.name : entry.name;
    if (entry.isDirectory()) await collect(path.join(directory, entry.name), name);
    else if (entry.isFile()) files["implementation-ledger/" + name] = new Uint8Array(await readFile(path.join(directory, entry.name)));
  }
}
await collect(source);
for (const required of ["SKILL.md", "references/ledger-format.md", "assets/tickets-template.md", "scripts/check-ledger.mjs", "scripts/ticket-md.mjs"]) {
  if (!files["implementation-ledger/" + required]) throw new Error("Missing bundled skill file: " + required);
}
const hash = createHash("sha256");
for (const [name, bytes] of Object.entries(files)) hash.update(name).update(bytes);
const version = hash.digest("hex").slice(0, 12);
const guide = `Implementation Ledger / Codex
Bundle version: ${version}

한국어
1. implementation-ledger.zip을 내려받아 압축을 풉니다.
2. implementation-ledger 폴더 전체를 ~/.codex/skills/ 안에 넣습니다.
   CODEX_HOME을 따로 설정했다면 해당 폴더의 skills/를 사용합니다.
3. 같은 이름의 스킬이 이미 있다면 먼저 별도로 백업하고 변경 내용을 비교하세요.
   이 웹앱은 설치된 스킬을 덮어쓰거나 Codex를 실행하지 않습니다.
4. Codex를 다시 열고 $implementation-ledger로 만들고 싶은 것을 논의하며 플랜 초안을 만듭니다.
5. 플랜의 열린 질문을 읽고 이번 구현에 영향을 주는 질문부터 AI와 논의하세요.
   다음 작업에 관한 질문은 남겨둬도 됩니다. 합의한 범위와 완료 기준을 티켓에 반영해
   새로 작성하거나 갱신한 뒤 구현을 요청하세요.
6. 웹앱에서 프로젝트 폴더를 연결해 계획과 진행 상황을 확인합니다.
   작업은 Codex 채팅에서 이어가세요. 필요한 경우에만 보드에서 티켓을 옮기거나 지시를 남기고,
   Codex에 변경된 문서를 다시 읽어달라고 요청하세요.

검증 및 ticket-md 보조 스크립트를 터미널에서 실행하려면 Node.js가 필요합니다.

English
Extract the complete implementation-ledger folder into ~/.codex/skills/
(or $CODEX_HOME/skills/). Back up and compare an existing installation first.
Reopen Codex and invoke $implementation-ledger to discuss what you want to build and
draft a plan. Read its open questions and discuss those affecting this implementation;
questions about later work can stay open. Create or update tickets with the agreed
scope and completion criteria before requesting implementation.
Connect the project folder here to review the plan and progress.
Continue the work in Codex chat. Move tickets or leave instructions on the board only
when needed, then ask Codex to reread the changed Markdown.
Node.js is required only for optional terminal helper scripts, not the browser app.
`;
// A BOM also identifies UTF-8 when a static server omits the text/plain charset.
const guideBytes = strToU8("\uFEFF" + guide);
files["INSTALL.txt"] = guideBytes;
const archive = zipSync(files, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "implementation-ledger.zip"), archive);
await writeFile(path.join(destination, `implementation-ledger-${version}.zip`), archive);
await writeFile(path.join(destination, "INSTALL.txt"), guideBytes);
await writeFile(path.join(destination, "manifest.json"), JSON.stringify({ version, archive: `implementation-ledger-${version}.zip`, files: Object.keys(files) }, null, 2));
console.log(`Packaged implementation-ledger ${version} (${Object.keys(files).length} files).`);
